import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

/**
 * Únicos accesos de solo lectura que resuelven "a qué curso pertenece" una
 * entidad del árbol de contenido. Es la excepción documentada a la regla de
 * que cada repositorio solo toca sus propias tablas.
 */
@Injectable()
export class CourseAccessRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCourseBasics(courseId: number) {
    return this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        teacherId: true,
        status: true,
        visibility: true,
        qaEnabled: true,
      },
    });
  }

  /** Condiciones para inscribirse en un curso (solo lectura). */
  findEnrollmentRules(courseId: number) {
    return this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        status: true,
        visibility: true,
        accessPassword: true,
        maxStudents: true,
        requires: {
          select: { prerequisite: { select: { id: true, title: true } } },
        },
      },
    });
  }

  async courseIdOfModule(moduleId: number): Promise<number | null> {
    const found = await this.prisma.courseModule.findUnique({
      where: { id: moduleId },
      select: { courseId: true },
    });

    return found?.courseId ?? null;
  }

  async courseIdOfLesson(lessonId: number): Promise<number | null> {
    const found = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { module: { select: { courseId: true } } },
    });

    return found?.module.courseId ?? null;
  }

  async courseIdOfResource(resourceId: number): Promise<number | null> {
    const found = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { lesson: { select: { module: { select: { courseId: true } } } } },
    });

    return found?.lesson.module.courseId ?? null;
  }

  async courseIdOfEvaluation(evaluationId: number): Promise<number | null> {
    const found = await this.prisma.evaluation.findUnique({
      where: { id: evaluationId },
      select: { module: { select: { courseId: true } } },
    });

    return found?.module.courseId ?? null;
  }

  async courseIdOfAssignment(assignmentId: number): Promise<number | null> {
    const found = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { module: { select: { courseId: true } } },
    });

    return found?.module.courseId ?? null;
  }
}
