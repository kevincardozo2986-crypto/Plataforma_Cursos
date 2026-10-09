import { Injectable } from '@nestjs/common';

import { managedBy } from '../../common/prisma/managed-by.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { EnrollmentStatus } from '../../generated/prisma/enums.js';
import type { Bucket } from './dashboard-calc.js';

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
