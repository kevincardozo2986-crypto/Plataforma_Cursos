import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CourseStatus,
  DripType,
  EnrollmentStatus,
  Role,
} from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessRepository } from './course-access.repository.js';
import {
  computeAvailability,
  type DripKind,
  lockMessage,
  type ModuleAvailability,
} from './drip.js';

/** A qué contenido se quiere entrar; de ahí se deduce el módulo y el curso. */
export type ContentRef =
  | { moduleId: number }
  | { lessonId: number }
  | { evaluationId: number }
  | { assignmentId: number };

/**
 * Reglas de acceso compartidas por courses, modules, lessons, resources,
 * evaluations y progress.
 */
@Injectable()
export class CourseAccessService {
  constructor(private readonly repository: CourseAccessRepository) {}

  async getCourseOrThrow(courseId: number) {
    const course = await this.repository.findCourseBasics(courseId);

    if (!course) {
      throw new NotFoundException('El curso no existe');
    }

    return course;
  }

  /** Estado, acceso, cupo y prerrequisitos de un curso, para decidir si alguien puede inscribirse. */
  async getEnrollmentRules(courseId: number) {
    const rules = await this.repository.findEnrollmentRules(courseId);

    if (!rules) {
      throw new NotFoundException('El curso no existe');
    }

    return {
      status: rules.status,
      visibility: rules.visibility,
      accessPasswordHash: rules.accessPassword,
      maxStudents: rules.maxStudents,
      prerequisites: rules.requires.map((item) => item.prerequisite),
    };
  }

  canManage(user: AuthenticatedUser, course: { teacherId: number }): boolean {
    return (
      user.role === Role.ADMIN ||
      (user.role === Role.TEACHER && course.teacherId === user.id)
    );
  }

  async assertCanManage(user: AuthenticatedUser, courseId: number) {
    const course = await this.getCourseOrThrow(courseId);

    if (!this.canManage(user, course)) {
      throw new ForbiddenException(
        'No tienes permisos para modificar este curso',
      );
    }

    return course;
  }

  /** Un curso publicado lo ve cualquier usuario; los demás, solo quien lo gestiona. */
  async assertCanView(user: AuthenticatedUser, courseId: number) {
    const course = await this.getCourseOrThrow(courseId);

    if (
      course.status !== CourseStatus.PUBLISHED &&
      !this.canManage(user, course)
    ) {
      throw new NotFoundException('El curso no existe');
    }

    return course;
  }

  /**
   * ¿Puede esta persona abrir este contenido (lección, recurso, quiz o tarea)?
   * - Quien gestiona el curso (su docente, un admin): siempre.
   * - Un estudiante inscrito: sí, salvo que el módulo siga cerrado por la liberación gradual.
   * - Sin inscripción: solo si el curso es de contenido público y no tiene liberación gradual.
   * Si no, responde 403 con el motivo (`locked`) para que el frontend lo explique.
   */
  async assertContentAccess(user: AuthenticatedUser, ref: ContentRef) {
    const { moduleId, courseId } = await this.locate(ref);
    const course = await this.assertCanView(user, courseId);

    if (this.canManage(user, course)) {
      return;
    }

    const enrollment = await this.activeEnrollment(user.id, courseId);

    if (!enrollment) {
      if (course.publicContent && course.dripType === DripType.NONE) {
        return;
      }

      throw this.locked({
        moduleId,
        locked: true,
        reason: 'NOT_ENROLLED',
        unlocksAt: null,
        requiredModules: [],
      });
    }

    if (course.dripType === DripType.NONE) {
      return;
    }

    const mine = (
      await this.availability(course.dripType, courseId, enrollment)
    ).find((item) => item.moduleId === moduleId);

    if (mine?.locked) {
      throw this.locked(mine);
    }
  }

  /**
   * Qué módulos tiene abiertos esta persona en el curso. Quien gestiona el curso lo ve todo
   * abierto; un estudiante, según su inscripción y su avance.
   */
  async moduleAvailability(user: AuthenticatedUser, courseId: number) {
    const course = await this.assertCanView(user, courseId);
    const modules = await this.repository.findDripModules(courseId);
    const open = (moduleId: number): ModuleAvailability => ({
      moduleId,
      locked: false,
      reason: null,
      unlocksAt: null,
      requiredModules: [],
    });

    let items: ModuleAvailability[];

    if (this.canManage(user, course)) {
      items = modules.map((m) => open(m.id));
    } else {
      const enrollment = await this.activeEnrollment(user.id, courseId);

      if (!enrollment) {
        const isPublic =
          course.publicContent && course.dripType === DripType.NONE;

        items = modules.map((m) =>
          isPublic
            ? open(m.id)
            : { ...open(m.id), locked: true, reason: 'NOT_ENROLLED' },
        );
      } else {
        items = await this.availability(course.dripType, courseId, enrollment);
      }
    }

    return { dripType: course.dripType, modules: items };
  }

  async courseIdOfModule(moduleId: number): Promise<number> {
    return this.orNotFound(
      await this.repository.courseIdOfModule(moduleId),
      'El módulo no existe',
    );
  }

  async courseIdOfLesson(lessonId: number): Promise<number> {
    return this.orNotFound(
      await this.repository.courseIdOfLesson(lessonId),
      'La lección no existe',
    );
  }

  async courseIdOfResource(resourceId: number): Promise<number> {
    return this.orNotFound(
      await this.repository.courseIdOfResource(resourceId),
      'El recurso no existe',
    );
  }

  async courseIdOfEvaluation(evaluationId: number): Promise<number> {
    return this.orNotFound(
      await this.repository.courseIdOfEvaluation(evaluationId),
      'La evaluación no existe',
    );
  }

  async courseIdOfAssignment(assignmentId: number): Promise<number> {
    return this.orNotFound(
      await this.repository.courseIdOfAssignment(assignmentId),
      'La tarea no existe',
    );
  }

  /** Una inscripción vigente (activa o completada), o null. */
  private async activeEnrollment(userId: number, courseId: number) {
    const enrollment = await this.repository.findEnrollmentBasics(
      userId,
      courseId,
    );

    return enrollment && enrollment.status !== EnrollmentStatus.CANCELLED
      ? enrollment
      : null;
  }

  private async availability(
    type: DripKind,
    courseId: number,
    enrollment: { id: number; enrolledAt: Date },
  ) {
    const [modules, completed] = await Promise.all([
      this.repository.findDripModules(courseId),
      this.repository.completedModuleIds(enrollment.id, courseId),
    ]);

    return computeAvailability(type, modules, {
      now: new Date(),
      enrolledAt: enrollment.enrolledAt,
      completed: new Set(completed),
    });
  }

  private locked(availability: ModuleAvailability) {
    return new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      message: lockMessage(availability),
      locked: {
        reason: availability.reason,
        unlocksAt: availability.unlocksAt,
        requiredModules: availability.requiredModules,
      },
    });
  }

  /** Módulo y curso de un contenido, sea cual sea el punto de partida. */
  private async locate(ref: ContentRef) {
    let moduleId: number | null;
    let missing: string;

    if ('moduleId' in ref) {
      moduleId = ref.moduleId;
      missing = 'El módulo no existe';
    } else if ('lessonId' in ref) {
      moduleId = await this.repository.moduleIdOfLesson(ref.lessonId);
      missing = 'La lección no existe';
    } else if ('evaluationId' in ref) {
      moduleId = await this.repository.moduleIdOfEvaluation(ref.evaluationId);
      missing = 'La evaluación no existe';
    } else {
      moduleId = await this.repository.moduleIdOfAssignment(ref.assignmentId);
      missing = 'La tarea no existe';
    }

    if (moduleId === null) {
      throw new NotFoundException(missing);
    }

    return { moduleId, courseId: await this.courseIdOfModule(moduleId) };
  }

  private orNotFound(courseId: number | null, message: string): number {
    if (courseId === null) {
      throw new NotFoundException(message);
    }

    return courseId;
  }
}
