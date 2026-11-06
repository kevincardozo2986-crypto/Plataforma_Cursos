import { Injectable } from '@nestjs/common';

import { managedBy } from '../../common/prisma/managed-by.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { EnrollmentStatus } from '../../generated/prisma/enums.js';
import type { Bucket } from './dashboard-calc.js';
import type { StudentState } from './dto/dashboard-query.dto.js';

/** Qué cursos se miden: los de un docente, uno solo, o todos (admin). */
export interface Scope {
  teacherId?: number;
  courseId?: number;
}

const courseFilter = (scope: Scope): Prisma.CourseWhereInput => ({
  ...(scope.teacherId === undefined ? {} : managedBy(scope.teacherId)),
  id: scope.courseId,
});

/** Condición SQL sobre la tabla de cursos con alias `c`. */
function courseSql(scope: Scope) {
  const conditions = [Prisma.sql`TRUE`];

  if (scope.teacherId !== undefined) {
    // El autor del curso o uno de sus instructores.
    conditions.push(
      Prisma.sql`(c."teacherId" = ${scope.teacherId} OR EXISTS (
        SELECT 1 FROM course_instructors ci
        WHERE ci."courseId" = c."id" AND ci."userId" = ${scope.teacherId}))`,
    );
  }
  if (scope.courseId !== undefined) {
    conditions.push(Prisma.sql`c."id" = ${scope.courseId}`);
  }

  return Prisma.join(conditions, ' AND ');
}

const DAY_MS = 24 * 60 * 60 * 1000;

const sinceSql = (column: Prisma.Sql, since?: Date) =>
  since ? Prisma.sql`AND ${column} >= ${since}` : Prisma.empty;

/**
 * Consultas de solo lectura para las métricas. Este módulo agrega datos de cursos,
 * inscripciones y evaluaciones sin modificar nada (ver ARCHITECTURE.md, "Lectura agregada").
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async courseCountsByStatus(scope: Scope) {
    const rows = await this.prisma.course.groupBy({
      by: ['status'],
      where: courseFilter(scope),
      _count: { _all: true },
    });

    return new Map(rows.map((r) => [r.status as string, r._count._all]));
  }

  findCourses(scope: Scope) {
    return this.prisma.course.findMany({
      where: courseFilter(scope),
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, status: true },
    });
  }

  async enrollmentCountsByStatus(scope: Scope, since?: Date) {
    const rows = await this.prisma.enrollment.groupBy({
      by: ['status'],
      where: {
        course: courseFilter(scope),
        enrolledAt: since ? { gte: since } : undefined,
      },
      _count: { _all: true },
    });

    return new Map(rows.map((r) => [r.status as string, r._count._all]));
  }

  async enrollmentCountsByCourse(scope: Scope, since?: Date) {
    const rows = await this.prisma.enrollment.groupBy({
      by: ['courseId', 'status'],
      where: {
        course: courseFilter(scope),
        enrolledAt: since ? { gte: since } : undefined,
      },
      _count: { _all: true },
    });

    return rows.map((r) => ({
      courseId: r.courseId,
      status: r.status as string,
      total: r._count._all,
    }));
  }

  /** Inscripciones activas que no han avanzado ninguna lección desde `cutoff`. */
  countInactive(scope: Scope, cutoff: Date, since?: Date) {
    return this.prisma.enrollment.count({
      where: {
        course: courseFilter(scope),
        status: EnrollmentStatus.ACTIVE,
        enrolledAt: { lt: cutoff, ...(since ? { gte: since } : {}) },
        lessonProgress: { none: { completedAt: { gte: cutoff } } },
      },
    });
  }

  async countStudents(scope: Scope, since?: Date): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(DISTINCT e."userId")::int AS total
      FROM enrollments e
      JOIN courses c ON c."id" = e."courseId"
      WHERE ${courseSql(scope)} ${sinceSql(Prisma.sql`e."enrolledAt"`, since)}`;

    return row?.total ?? 0;
  }

  /** Estudiantes distintos e inscripciones entre dos fechas (para comparar con el periodo anterior). */
  async countsBetween(scope: Scope, from: Date, to: Date) {
    const [row] = await this.prisma.$queryRaw<{ students: number; enrollments: number }[]>`
      SELECT COUNT(DISTINCT e."userId")::int AS students, COUNT(*)::int AS enrollments
      FROM enrollments e
      JOIN courses c ON c."id" = e."courseId"
      WHERE ${courseSql(scope)}
        AND e."enrolledAt" >= ${from} AND e."enrolledAt" < ${to}`;

    return { students: row?.students ?? 0, enrollments: row?.enrollments ?? 0 };
  }

  /** Quienes terminaron un curso y todavía no lo reseñaron: a ellos se les puede pedir una reseña. */
  completedWithoutReview(scope: Scope) {
    return this.prisma.$queryRaw<{ userId: number; courseId: number; title: string }[]>`
      SELECT e."userId", e."courseId", c."title"
      FROM enrollments e
      JOIN courses c ON c."id" = e."courseId"
      WHERE e."status" = 'COMPLETED' AND ${courseSql(scope)}
        AND NOT EXISTS (
          SELECT 1 FROM reviews r WHERE r."courseId" = e."courseId" AND r."userId" = e."userId"
        )`;
  }

  enrollmentSeries(scope: Scope, bucket: Bucket, since?: Date) {
    return this.prisma.$queryRaw<{ bucket: Date; total: number }[]>`
      SELECT date_trunc(${bucket}, e."enrolledAt") AS bucket, COUNT(*)::int AS total
      FROM enrollments e
      JOIN courses c ON c."id" = e."courseId"
      WHERE ${courseSql(scope)} ${sinceSql(Prisma.sql`e."enrolledAt"`, since)}
      GROUP BY 1 ORDER BY 1`;
  }

  completionSeries(scope: Scope, bucket: Bucket, since?: Date) {
    return this.prisma.$queryRaw<{ bucket: Date; total: number }[]>`
      SELECT date_trunc(${bucket}, e."completedAt") AS bucket, COUNT(*)::int AS total
      FROM enrollments e
      JOIN courses c ON c."id" = e."courseId"
      WHERE e."completedAt" IS NOT NULL AND ${courseSql(scope)}
        ${sinceSql(Prisma.sql`e."completedAt"`, since)}
      GROUP BY 1 ORDER BY 1`;
  }

  /** Intentos ya calificados: cuántos, nota promedio y cuántos aprobaron. */
  async quizStats(scope: Scope, since?: Date) {
    const [row] = await this.prisma.$queryRaw<
      { attempts: number; average: number; passed: number }[]
    >`
      SELECT COUNT(*)::int AS attempts,
             COALESCE(ROUND(AVG(a."score")), 0)::int AS average,
             COALESCE(SUM(CASE WHEN a."passed" THEN 1 ELSE 0 END), 0)::int AS passed
      FROM evaluation_attempts a
      JOIN evaluations ev ON ev."id" = a."evaluationId"
      JOIN modules m ON m."id" = ev."moduleId"
      JOIN courses c ON c."id" = m."courseId"
      WHERE a."status" = 'GRADED' AND ${courseSql(scope)}
        ${sinceSql(Prisma.sql`a."createdAt"`, since)}`;

    return row ?? { attempts: 0, average: 0, passed: 0 };
  }

  averageScoreByCourse(scope: Scope, since?: Date) {
    return this.prisma.$queryRaw<{ courseId: number; average: number }[]>`
      SELECT m."courseId" AS "courseId", ROUND(AVG(a."score"))::int AS average
      FROM evaluation_attempts a
      JOIN evaluations ev ON ev."id" = a."evaluationId"
      JOIN modules m ON m."id" = ev."moduleId"
      JOIN courses c ON c."id" = m."courseId"
      WHERE a."status" = 'GRADED' AND ${courseSql(scope)}
        ${sinceSql(Prisma.sql`a."createdAt"`, since)}
      GROUP BY m."courseId"`;
  }

  /** Promedio de estrellas y cantidad de reseñas por curso. */
  async ratingByCourse(scope: Scope, since?: Date) {
    const rows = await this.prisma.review.groupBy({
      by: ['courseId'],
      where: {
        course: courseFilter(scope),
        createdAt: since ? { gte: since } : undefined,
      },
      _avg: { rating: true },
      _count: { _all: true },
    });

    return rows.map((row) => ({
      courseId: row.courseId,
      average: row._avg.rating ?? 0,
      count: row._count._all,
    }));
  }

  /**
   * Una fila por inscripción: la persona, el curso, su avance, su última actividad y sus notas.
   * El estado sale de la inscripción y de su actividad: terminó, cancelada, activa o inactiva
   * (activa sin avanzar ninguna lección desde `cutoff`).
   */
  async students(
    scope: Scope,
    filter: { since?: Date; cutoff: Date; now: Date; state?: StudentState; q?: string; take: number; skip: number },
  ) {
    const search = filter.q?.trim() ? `%${filter.q.trim().replace(/[%_\\]/g, '\\$&')}%` : null;
    const where = Prisma.sql`${courseSql(scope)} ${sinceSql(Prisma.sql`e."enrolledAt"`, filter.since)}
      ${search ? Prisma.sql`AND (u."firstName" || ' ' || u."lastName" ILIKE ${search} OR u."email" ILIKE ${search})` : Prisma.empty}`;

    // Lecciones completadas en cada una de las últimas 8 semanas (de la más antigua a la actual).
    const edges = Array.from(
      { length: 9 },
      (_, i) => new Date(filter.now.getTime() - (8 - i) * 7 * DAY_MS + (i === 8 ? 60 * 60 * 1000 : 0)),
    );
    const weeksSql = Prisma.sql`(SELECT ARRAY[${Prisma.join(
      Array.from(
        { length: 8 },
        (_, i) =>
          Prisma.sql`(COUNT(*) FILTER (WHERE lp."completedAt" >= ${edges[i]} AND lp."completedAt" < ${edges[i + 1]}))::int`,
      ),
    )}] FROM lesson_progress lp WHERE lp."enrollmentId" = e."id")`;

    const base = Prisma.sql`
      SELECT e."id" AS "enrollmentId", u."id" AS "userId", u."firstName", u."lastName", u."email",
             c."id" AS "courseId", c."title" AS "courseTitle",
             e."enrolledAt", e."completedAt",
             (SELECT COUNT(*) FROM lessons l JOIN modules m ON m."id" = l."moduleId"
               WHERE m."courseId" = c."id")::int AS "totalLessons",
             (SELECT COUNT(*) FROM lesson_progress lp WHERE lp."enrollmentId" = e."id")::int AS "doneLessons",
             (SELECT MAX(lp."completedAt") FROM lesson_progress lp WHERE lp."enrollmentId" = e."id") AS "lastActivityAt",
             (SELECT ROUND(AVG(a."score"))::int FROM evaluation_attempts a
               JOIN evaluations ev ON ev."id" = a."evaluationId" JOIN modules m ON m."id" = ev."moduleId"
               WHERE m."courseId" = c."id" AND a."userId" = u."id" AND a."status" = 'GRADED') AS "quizAverage",
             (SELECT ROUND(AVG(100.0 * s."score" / NULLIF(asg."maxScore", 0)))::int FROM assignment_submissions s
               JOIN assignments asg ON asg."id" = s."assignmentId" JOIN modules m ON m."id" = asg."moduleId"
               WHERE m."courseId" = c."id" AND s."userId" = u."id" AND s."status" = 'GRADED') AS "taskAverage",
             ${weeksSql} AS "weeks",
             (SELECT COUNT(*) FROM evaluations ev JOIN modules m ON m."id" = ev."moduleId"
               WHERE m."courseId" = c."id")::int AS "totalQuizzes",
             (SELECT COUNT(DISTINCT a."evaluationId") FROM evaluation_attempts a
               JOIN evaluations ev ON ev."id" = a."evaluationId" JOIN modules m ON m."id" = ev."moduleId"
               WHERE m."courseId" = c."id" AND a."userId" = u."id")::int AS "doneQuizzes",
             (SELECT COUNT(*) FROM assignments asg JOIN modules m ON m."id" = asg."moduleId"
               WHERE m."courseId" = c."id")::int AS "totalTasks",
             (SELECT COUNT(DISTINCT s."assignmentId") FROM assignment_submissions s
               JOIN assignments asg ON asg."id" = s."assignmentId" JOIN modules m ON m."id" = asg."moduleId"
               WHERE m."courseId" = c."id" AND s."userId" = u."id")::int AS "doneTasks",
             CASE
               WHEN e."status" = 'CANCELLED' THEN 'CANCELLED'
               WHEN e."status" = 'COMPLETED' OR e."completedAt" IS NOT NULL THEN 'COMPLETED'
               WHEN e."enrolledAt" < ${filter.cutoff} AND NOT EXISTS (
                 SELECT 1 FROM lesson_progress lp WHERE lp."enrollmentId" = e."id" AND lp."completedAt" >= ${filter.cutoff}
               ) THEN 'INACTIVE'
               ELSE 'IN_PROGRESS'
             END AS "state"
      FROM enrollments e
      JOIN users u ON u."id" = e."userId"
      JOIN courses c ON c."id" = e."courseId"
      WHERE ${where}`;

    const stateFilter = filter.state ? Prisma.sql`WHERE r."state" = ${filter.state}` : Prisma.empty;

    const [items, [count]] = await Promise.all([
      this.prisma.$queryRaw<
        {
          enrollmentId: number;
          userId: number;
          firstName: string;
          lastName: string;
          email: string;
          courseId: number;
          courseTitle: string;
          enrolledAt: Date;
          completedAt: Date | null;
          totalLessons: number;
          doneLessons: number;
          lastActivityAt: Date | null;
          quizAverage: number | null;
          taskAverage: number | null;
          weeks: number[];
          totalQuizzes: number;
          doneQuizzes: number;
          totalTasks: number;
          doneTasks: number;
          state: StudentState;
        }[]
      >`SELECT r.* FROM (${base}) r ${stateFilter} ORDER BY r."enrolledAt" DESC, r."enrollmentId" DESC
         LIMIT ${filter.take} OFFSET ${filter.skip}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM (${base}) r ${stateFilter}`,
    ]);

    return { items, total: count?.total ?? 0 };
  }

  // --- Detalle de una inscripción y recordatorios ---

  /** La inscripción con la persona y el curso (para comprobar permisos y armar el detalle). */
  findEnrollment(id: number) {
    return this.prisma.enrollment.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        courseId: true,
        status: true,
        enrolledAt: true,
        completedAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
        course: { select: { id: true, title: true } },
      },
    });
  }

  /** Las lecciones del curso en orden (módulo y posición). */
  lessonsOfCourse(courseId: number) {
    return this.prisma.lesson.findMany({
      where: { module: { courseId } },
      orderBy: [{ module: { position: 'asc' } }, { position: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true },
    });
  }

  /** Lecciones que ya completó esta inscripción, con su título y fecha. */
  completedLessons(enrollmentId: number) {
    return this.prisma.lessonProgress.findMany({
      where: { enrollmentId },
      orderBy: { completedAt: 'desc' },
      select: { lessonId: true, completedAt: true, lesson: { select: { title: true } } },
    });
  }

  /** Últimos quizzes presentados y tareas entregadas por esa persona en ese curso. */
  async recentWork(userId: number, courseId: number, take: number) {
    const [attempts, submissions] = await Promise.all([
      this.prisma.evaluationAttempt.findMany({
        where: { userId, evaluation: { module: { courseId } } },
        orderBy: { createdAt: 'desc' },
        take,
        select: { score: true, passed: true, status: true, createdAt: true, evaluation: { select: { title: true } } },
      }),
      this.prisma.assignmentSubmission.findMany({
        where: { userId, assignment: { module: { courseId } } },
        orderBy: { submittedAt: 'desc' },
        take,
        select: { status: true, score: true, submittedAt: true, assignment: { select: { title: true, maxScore: true } } },
      }),
    ]);

    return { attempts, submissions };
  }

  /** Cuántas reseñas hay de cada número de estrellas, y las más recientes. */
  async ratingBreakdown(scope: Scope, since?: Date) {
    const where: Prisma.ReviewWhereInput = {
      course: courseFilter(scope),
      createdAt: since ? { gte: since } : undefined,
    };

    const [groups, recent] = await Promise.all([
      this.prisma.review.groupBy({ by: ['rating'], where, _count: { _all: true } }),
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true } },
          course: { select: { id: true, title: true } },
        },
      }),
    ]);

    return { groups: groups.map((g) => ({ rating: g.rating, count: g._count._all })), recent };
  }

  /** Entregas de tareas esperando nota (sin límite de fecha). */
  countPendingSubmissions(scope: Scope) {
    return this.prisma.assignmentSubmission.count({
      where: {
        status: 'SUBMITTED',
        assignment: { module: { course: courseFilter(scope) } },
      },
    });
  }

  /** Intentos esperando que el docente califique preguntas abiertas (sin límite de fecha). */
  countPendingReviews(scope: Scope) {
    return this.prisma.evaluationAttempt.count({
      where: {
        status: 'PENDING_REVIEW',
        evaluation: { module: { course: courseFilter(scope) } },
      },
    });
  }
}
