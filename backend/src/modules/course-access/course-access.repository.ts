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

  /**
   * Lo que pide cada módulo para darlo por terminado, con el avance de este estudiante:
   * ver todas las lecciones, aprobar cada evaluación y entregar cada tarea.
   * (Una tarea solo necesita estar entregada: no se espera a que el docente la califique.)
   */
  async moduleRequirements(userId: number, enrollmentId: number, courseId: number) {
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        lessons: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: { id: true, title: true, progress: { where: { enrollmentId }, select: { id: true } } },
        },
        evaluations: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            title: true,
            passingScore: true,
            attempts: { where: { userId, status: 'GRADED' }, select: { passed: true, score: true } },
          },
        },
        assignments: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            title: true,
            dueAt: true,
            submissions: { where: { userId }, select: { status: true, score: true } },
          },
        },
      },
    });

    return modules.map((module) => ({
      moduleId: module.id,
      requirements: [
        ...module.lessons.map((lesson) => ({
          type: 'lesson' as const,
          id: lesson.id,
          title: lesson.title,
          done: lesson.progress.length > 0,
          dueAt: null as Date | null,
        })),
        ...module.evaluations.map((evaluation) => ({
          type: 'evaluation' as const,
          id: evaluation.id,
          title: evaluation.title,
          done: evaluation.attempts.some((a) => a.passed && a.score >= evaluation.passingScore),
          dueAt: null as Date | null,
        })),
        ...module.assignments.map((assignment) => ({
          type: 'assignment' as const,
          id: assignment.id,
          title: assignment.title,
          done: assignment.submissions.length > 0,
          dueAt: assignment.dueAt,
        })),
      ],
    }));
  }

  /** Ids de los módulos terminados: todas sus lecciones vistas, evaluaciones aprobadas y tareas entregadas. */
  async completedModuleIds(userId: number, enrollmentId: number, courseId: number): Promise<number[]> {
    return (await this.moduleRequirements(userId, enrollmentId, courseId))
      .filter((module) => module.requirements.every((item) => item.done))
      .map((module) => module.moduleId);
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
        price: true,
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
