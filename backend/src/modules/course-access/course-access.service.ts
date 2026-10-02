import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CourseStatus, Role } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessRepository } from './course-access.repository.js';

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

  private orNotFound(courseId: number | null, message: string): number {
    if (courseId === null) {
      throw new NotFoundException(message);
    }

    return courseId;
  }
}
