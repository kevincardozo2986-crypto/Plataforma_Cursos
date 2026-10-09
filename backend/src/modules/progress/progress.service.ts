import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';

import {
  CourseStatus,
  CourseVisibility,
  EnrollmentStatus,
} from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { LessonsService } from '../lessons/lessons.service.js';
import { ProgressRepository } from './progress.repository.js';

@Injectable()
export class ProgressService {
  constructor(
    private readonly repository: ProgressRepository,
    private readonly access: CourseAccessService,
    private readonly lessons: LessonsService,
  ) {}

  // --- Inscripciones ---

  async enroll(user: AuthenticatedUser, courseId: number, password?: string) {
    const rules = await this.access.getEnrollmentRules(courseId);

    if (rules.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException('El curso no existe');
    }

    const existing = await this.repository.findEnrollment(user.id, courseId);

    if (existing && existing.status !== EnrollmentStatus.CANCELLED) {
      throw new ConflictException('Ya estás inscrito en este curso');
    }

    await this.assertCanJoin(user.id, courseId, rules, password);

    if (existing) {
      return this.repository.updateEnrollment(existing.id, {
        status: EnrollmentStatus.ACTIVE,
        completedAt: null,
      });
    }

    return this.repository.createEnrollment(user.id, courseId);
  }

  async cancel(user: AuthenticatedUser, courseId: number) {
    const enrollment = await this.getEnrollmentOrThrow(user.id, courseId);

    return this.repository.updateEnrollment(enrollment.id, {
      status: EnrollmentStatus.CANCELLED,
    });
  }

  async myEnrollments(user: AuthenticatedUser) {
    const enrollments = await this.repository.findActiveByUser(user.id);

    return Promise.all(
      enrollments.map(async (enrollment) => ({
        ...enrollment,
        progress: await this.computeProgress(enrollment.id, enrollment.courseId),
      })),
    );
  }

  /** Estudiantes inscritos en un curso (profesor dueño o admin). */
  async courseEnrollments(user: AuthenticatedUser, courseId: number) {
    await this.access.assertCanManage(user, courseId);

    const enrollments = await this.repository.findByCourse(courseId);

    return Promise.all(
      enrollments.map(async (enrollment) => ({
        ...enrollment,
        progress: await this.computeProgress(enrollment.id, courseId),
      })),
    );
  }

  /** Para otros módulos: ¿hay estudiantes inscritos en este curso? */
  async countEnrollments(courseId: number): Promise<number> {
    return this.repository.countEnrollments(courseId);
  }

  /** Para otros módulos (evaluations): ¿el usuario está inscrito y activo? */
  async isEnrolled(userId: number, courseId: number): Promise<boolean> {
    const enrollment = await this.repository.findEnrollment(userId, courseId);

    return (
      enrollment !== null && enrollment.status !== EnrollmentStatus.CANCELLED
    );
  }

  /** Para otros módulos (anuncios): estudiantes con inscripción vigente en el curso. */
  async enrolledUserIds(courseId: number): Promise<number[]> {
    return this.repository.enrolledUserIds(courseId);
  }

  /** Para otros módulos (anuncios, discusiones): cursos en los que el usuario está inscrito. */
  async enrolledCourseIds(userId: number): Promise<number[]> {
    return this.repository.enrolledCourseIds(userId);
  }

  // --- Progreso ---

  async courseProgress(user: AuthenticatedUser, courseId: number) {
    const enrollment = await this.getEnrollmentOrThrow(user.id, courseId);

    return {
      status: enrollment.status,
      ...(await this.computeProgress(enrollment.id, courseId)),
    };
  }

  async completeLesson(user: AuthenticatedUser, lessonId: number) {
    const courseId = await this.access.courseIdOfLesson(lessonId);
    const enrollment = await this.getActiveEnrollment(user.id, courseId);

    // No se puede dar por vista una lección de un módulo que todavía está cerrado.
    await this.access.assertContentAccess(user, { lessonId });

    await this.repository.markLessonDone(enrollment.id, lessonId);

    const progress = await this.computeProgress(enrollment.id, courseId);

    if (
      progress.totalLessons > 0 &&
      progress.completedLessons === progress.totalLessons &&
      enrollment.status !== EnrollmentStatus.COMPLETED
    ) {
      await this.repository.updateEnrollment(enrollment.id, {
        status: EnrollmentStatus.COMPLETED,
        completedAt: new Date(),
      });
    }

    return progress;
  }

  async uncompleteLesson(user: AuthenticatedUser, lessonId: number) {
    const courseId = await this.access.courseIdOfLesson(lessonId);
    const enrollment = await this.getActiveEnrollment(user.id, courseId);

    await this.repository.unmarkLesson(enrollment.id, lessonId);

    if (enrollment.status === EnrollmentStatus.COMPLETED) {
      await this.repository.updateEnrollment(enrollment.id, {
        status: EnrollmentStatus.ACTIVE,
        completedAt: null,
      });
    }

    return this.computeProgress(enrollment.id, courseId);
  }

  // --- Internos ---

  /**
   * Reglas de acceso del curso, en este orden: privado, contraseña,
   * prerrequisitos y cupo. Cada una explica por qué no se puede entrar.
   */
  private async assertCanJoin(
    userId: number,
    courseId: number,
    rules: Awaited<ReturnType<CourseAccessService['getEnrollmentRules']>>,
    password: string | undefined,
  ) {
    if (rules.visibility === CourseVisibility.PRIVATE) {
      throw new ForbiddenException('Este curso es privado');
    }

    if (rules.visibility === CourseVisibility.PASSWORD) {
      const valid =
        Boolean(password) &&
        Boolean(rules.accessPasswordHash) &&
        (await bcrypt.compare(password as string, rules.accessPasswordHash as string));

      if (!valid) {
        throw new ForbiddenException(
          password ? 'La contraseña del curso es incorrecta' : 'Este curso requiere una contraseña',
        );
      }
    }

    if (rules.prerequisites.length > 0) {
      const done = new Set(
        await this.repository.completedCourseIds(
          userId,
          rules.prerequisites.map((item) => item.id),
        ),
      );
      const pending = rules.prerequisites.filter((item) => !done.has(item.id));

      if (pending.length > 0) {
        throw new ForbiddenException(
          `Antes debes completar: ${pending.map((item) => item.title).join(', ')}`,
        );
      }
    }

    if (
      rules.maxStudents !== null &&
      (await this.repository.countActiveEnrollments(courseId)) >= rules.maxStudents
    ) {
      throw new ConflictException('El curso no tiene cupos disponibles');
    }
  }

  private async computeProgress(enrollmentId: number, courseId: number) {
    const lessonIds = await this.lessons.idsByCourse(courseId);
    const completedLessonIds = await this.repository.completedLessonIds(
      enrollmentId,
      lessonIds,
    );

    const totalLessons = lessonIds.length;
    const completedLessons = completedLessonIds.length;

    return {
      totalLessons,
      completedLessons,
      percent:
        totalLessons === 0
          ? 0
          : Math.round((completedLessons / totalLessons) * 100),
      completedLessonIds,
    };
  }

  private async getEnrollmentOrThrow(userId: number, courseId: number) {
    const enrollment = await this.repository.findEnrollment(userId, courseId);

    if (!enrollment || enrollment.status === EnrollmentStatus.CANCELLED) {
      throw new NotFoundException('No estás inscrito en este curso');
    }

    return enrollment;
  }

  private async getActiveEnrollment(userId: number, courseId: number) {
    const enrollment = await this.repository.findEnrollment(userId, courseId);

    if (!enrollment || enrollment.status === EnrollmentStatus.CANCELLED) {
      throw new ForbiddenException(
        'Debes estar inscrito en el curso para registrar tu progreso',
      );
    }

    return enrollment;
  }
}
