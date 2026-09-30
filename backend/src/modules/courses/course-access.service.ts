import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { CourseStatus, Role } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';

/**
 * Reglas de acceso compartidas por courses, modules, lessons, resources,
 * evaluations y progress.
 */
@Injectable()
export class CourseAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getCourseOrThrow(courseId: number) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, teacherId: true, status: true },
    });

    if (!course) {
      throw new NotFoundException('El curso no existe');
    }

    return course;
  }

  canManage(
    user: AuthenticatedUser,
    course: { teacherId: number },
  ): boolean {
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

  async courseIdOfModule(moduleId: number): Promise<number> {
    const found = await this.prisma.courseModule.findUnique({
      where: { id: moduleId },
      select: { courseId: true },
    });

    if (!found) {
      throw new NotFoundException('El módulo no existe');
    }

    return found.courseId;
  }

  async courseIdOfLesson(lessonId: number): Promise<number> {
    const found = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { module: { select: { courseId: true } } },
    });

    if (!found) {
      throw new NotFoundException('La lección no existe');
    }

    return found.module.courseId;
  }

  async courseIdOfResource(resourceId: number): Promise<number> {
    const found = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { lesson: { select: { module: { select: { courseId: true } } } } },
    });

    if (!found) {
      throw new NotFoundException('El recurso no existe');
    }

    return found.lesson.module.courseId;
  }

  async courseIdOfEvaluation(evaluationId: number): Promise<number> {
    const found = await this.prisma.evaluation.findUnique({
      where: { id: evaluationId },
      select: { module: { select: { courseId: true } } },
    });

    if (!found) {
      throw new NotFoundException('La evaluación no existe');
    }

    return found.module.courseId;
  }
}
