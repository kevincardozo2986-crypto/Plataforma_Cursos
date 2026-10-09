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
        publicContent: true,
        dripType: true,
        instructors: { select: { userId: true } },
      },
    });
  }

  /** Módulos de un curso con sus ajustes de liberación (solo lectura). */
  async findDripModules(courseId: number) {
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        title: true,
        position: true,
        unlockAt: true,
        unlockAfterDays: true,
        requires: { select: { requiredModuleId: true } },
      },
    });

    return modules.map(({ requires, ...module }) => ({
      ...module,
      requires: requires.map((r) => r.requiredModuleId),
    }));
  }

  findEnrollmentBasics(userId: number, courseId: number) {
    return this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { id: true, status: true, enrolledAt: true },
    });
  }

  /** Ids de los módulos del curso con todas sus lecciones terminadas (uno sin lecciones cuenta como terminado). */
  async completedModuleIds(enrollmentId: number, courseId: number): Promise<number[]> {
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      select: {
        id: true,
        lessons: {
          select: {
            progress: { where: { enrollmentId }, select: { id: true } },
          },
        },
      },
    });

    return modules
      .filter((m) => m.lessons.every((lesson) => lesson.progress.length > 0))
      .map((m) => m.id);
  }

  async moduleIdOfLesson(lessonId: number): Promise<number | null> {
    const found = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { moduleId: true },
    });

    return found?.moduleId ?? null;
  }

  async moduleIdOfEvaluation(evaluationId: number): Promise<number | null> {
    const found = await this.prisma.evaluation.findUnique({
      where: { id: evaluationId },
      select: { moduleId: true },
    });

    return found?.moduleId ?? null;
  }

  async moduleIdOfAssignment(assignmentId: number): Promise<number | null> {
    const found = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { moduleId: true },
    });

    return found?.moduleId ?? null;
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
