import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseStatus, EnrollmentStatus, Role } from '../../generated/prisma/enums.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  bucketOf,
  fillSeries,
  INACTIVE_DAYS,
  mergeSeries,
  type Period,
  percent,
  previousWindow,
  sinceOf,
  weeklyCounts,
} from './dashboard-calc.js';
import { DashboardRepository, type Scope } from './dashboard.repository.js';
import type { StudentState } from './dto/dashboard-query.dto.js';
import { weightedAverage } from '../reviews/reviews-calc.js';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(
    private readonly repository: DashboardRepository,
    private readonly access: CourseAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Métricas del docente sobre sus cursos (el admin ve todos). Con `courseId` se limita
   * a un curso. El periodo filtra por fecha de inscripción; "todo el tiempo" no filtra.
   */
  async teacher(
    user: AuthenticatedUser,
    options: { period?: Period; courseId?: number } = {},
    now = new Date(),
  ) {
    const period = options.period ?? 'all';

    if (options.courseId !== undefined) {
      await this.access.assertCanManage(user, options.courseId);
    }

    const scope: Scope = {
      teacherId: user.role === Role.ADMIN ? undefined : user.id,
      courseId: options.courseId,
    };
    const since = sinceOf(period, now);
    const bucket = bucketOf(period);
    const inactiveCutoff = new Date(now.getTime() - INACTIVE_DAYS * DAY_MS);

    const [
      courseCounts,
      courses,
      enrollmentCounts,
      byCourse,
      inactive,
      students,
      enrolledSeries,
      completedSeries,
      quizzes,
      scores,
      pendingReview,
      pendingSubmissions,
      ratings,
      previous,
    ] = await Promise.all([
      this.repository.courseCountsByStatus(scope),
      this.repository.findCourses(scope),
      this.repository.enrollmentCountsByStatus(scope, since),
      this.repository.enrollmentCountsByCourse(scope, since),
      this.repository.countInactive(scope, inactiveCutoff, since),
      this.repository.countStudents(scope, since),
      this.repository.enrollmentSeries(scope, bucket, since),
      this.repository.completionSeries(scope, bucket, since),
      this.repository.quizStats(scope, since),
      this.repository.averageScoreByCourse(scope, since),
      this.repository.countPendingReviews(scope),
      this.repository.countPendingSubmissions(scope),
      this.repository.ratingByCourse(scope, since),
      // Solo se compara el total de mis cursos: con un curso filtrado o en "todo" no aplica.
      this.previousCounts(scope, period, options.courseId, now),
    ]);

    const count = (status: string) => enrollmentCounts.get(status) ?? 0;
    const active = count(EnrollmentStatus.ACTIVE);
    const completed = count(EnrollmentStatus.COMPLETED);
    const cancelled = count(EnrollmentStatus.CANCELLED);
    const enrolled = active + completed + cancelled;

    const scoreOf = new Map(scores.map((s) => [s.courseId, s.average]));
    const ratingOf = new Map(ratings.map((r) => [r.courseId, r]));

    return {
      period,
      since: since ?? null,
      courses: {
        total: courses.length,
        published: courseCounts.get(CourseStatus.PUBLISHED) ?? 0,
        draft: courseCounts.get(CourseStatus.DRAFT) ?? 0,
        archived: courseCounts.get(CourseStatus.ARCHIVED) ?? 0,
      },
      students,
      completion: {
        enrolled,
        completed,
        // Activas que sí avanzaron en los últimos INACTIVE_DAYS días.
        inProgress: Math.max(active - inactive, 0),
        inactive,
        cancelled,
        // Sobre quienes siguen o terminaron el curso: los cancelados no cuentan.
        rate: percent(completed, enrolled - cancelled),
        inactiveAfterDays: INACTIVE_DAYS,
      },
      quizzes: {
        attempts: quizzes.attempts,
        averageScore: quizzes.average,
        passRate: percent(quizzes.passed, quizzes.attempts),
        pendingReview,
      },
      assignments: {
        // Entregas esperando nota, sin límite de fecha.
        pendingGrading: pendingSubmissions,
      },
      // Calificación promedio (1 a 5) de las reseñas del periodo; null si no hay ninguna.
      rating: {
        average: weightedAverage(ratings),
        count: ratings.reduce((total, r) => total + r.count, 0),
      },
      // Estudiantes e inscripciones del periodo anterior, de la misma duración; null si no aplica.
      previous,
      bucket,
      series: fillSeries(
        mergeSeries(enrolledSeries, completedSeries, bucket),
        bucket,
        now,
        since,
      ),
      courseBreakdown: courses.map((course) => {
        const of = (status: string) =>
          byCourse.find((r) => r.courseId === course.id && r.status === status)
            ?.total ?? 0;
        const courseCompleted = of(EnrollmentStatus.COMPLETED);
        const courseCancelled = of(EnrollmentStatus.CANCELLED);
        const courseEnrolled =
          of(EnrollmentStatus.ACTIVE) + courseCompleted + courseCancelled;

        return {
          id: course.id,
          title: course.title,
          status: course.status,
          enrolled: courseEnrolled,
          completed: courseCompleted,
          cancelled: courseCancelled,
          completionRate: percent(
            courseCompleted,
            courseEnrolled - courseCancelled,
          ),
          averageScore: scoreOf.get(course.id) ?? null,
          rating: {
            average: weightedAverage(
              ratingOf.has(course.id) ? [ratingOf.get(course.id)!] : [],
            ),
            count: ratingOf.get(course.id)?.count ?? 0,
          },
        };
      }),
    };
  }

  /**
   * Quiénes están inscritos en los cursos del docente, con su avance y notas. Sirve para ver quién
   * va bien y quién se quedó atrás, y para exportarlo. Respeta los mismos filtros que `teacher()`.
   */
  async students(
    user: AuthenticatedUser,
    options: {
      period?: Period;
      courseId?: number;
      state?: StudentState;
      q?: string;
      limit?: number;
      offset?: number;
    } = {},
    now = new Date(),
  ) {
    if (options.courseId !== undefined) {
      await this.access.assertCanManage(user, options.courseId);
    }

    const scope: Scope = {
      teacherId: user.role === Role.ADMIN ? undefined : user.id,
      courseId: options.courseId,
    };

    const { items, total } = await this.repository.students(scope, {
      since: sinceOf(options.period ?? 'all', now),
      cutoff: new Date(now.getTime() - INACTIVE_DAYS * DAY_MS),
      now,
      state: options.state,
      q: options.q,
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    });

    return {
      total,
      inactiveAfterDays: INACTIVE_DAYS,
      items: items.map((row) => ({
        enrollmentId: row.enrollmentId,
        student: { id: row.userId, firstName: row.firstName, lastName: row.lastName, email: row.email },
        course: { id: row.courseId, title: row.courseTitle },
        state: row.state,
        enrolledAt: row.enrolledAt,
        completedAt: row.completedAt,
        lastActivityAt: row.lastActivityAt,
        progress: {
          completed: row.doneLessons,
          total: row.totalLessons,
          percent: row.totalLessons === 0 ? 0 : Math.min(100, Math.round((row.doneLessons / row.totalLessons) * 100)),
        },
        quizAverage: row.quizAverage,
        taskAverage: row.taskAverage,
        /** Lecciones completadas por semana en las últimas 8 (la última es la semana actual). */
        weeks: row.weeks ?? new Array<number>(8).fill(0),
        /** Quizzes presentados / quizzes del curso; null si el curso no tiene. */
        quizzes: row.totalQuizzes > 0 ? { done: row.doneQuizzes, total: row.totalQuizzes } : null,
        /** Tareas entregadas / tareas del curso; null si el curso no tiene. */
        tasks: row.totalTasks > 0 ? { done: row.doneTasks, total: row.totalTasks } : null,
      })),
    };
  }

  /**
   * Una inscripción en detalle: qué lecciones lleva (en orden), su actividad por semana y lo último que
   * hizo (lecciones, quizzes y tareas). Solo quien gestiona el curso.
   */
  async studentDetail(user: AuthenticatedUser, enrollmentId: number, now = new Date()) {
    const enrollment = await this.repository.findEnrollment(enrollmentId);

    if (!enrollment) {
      throw new NotFoundException('La inscripción no existe');
    }

    await this.access.assertCanManage(user, enrollment.courseId);

    const [lessons, done, work] = await Promise.all([
      this.repository.lessonsOfCourse(enrollment.courseId),
      this.repository.completedLessons(enrollmentId),
      this.repository.recentWork(enrollment.userId, enrollment.courseId, 8),
    ]);
    const doneIds = new Set(done.map((item) => item.lessonId));

    const events = [
      ...done.slice(0, 8).map((item) => ({ kind: 'LESSON' as const, label: `Completó «${item.lesson.title}»`, at: item.completedAt })),
      ...work.attempts.map((item) => ({
        kind: 'QUIZ' as const,
        label: `Presentó el quiz «${item.evaluation.title}» (${item.status === 'PENDING_REVIEW' ? 'por revisar' : `${item.score} / 100`})`,
        at: item.createdAt,
      })),
      ...work.submissions.map((item) => ({
        kind: 'TASK' as const,
        label: `Entregó la tarea «${item.assignment.title}»${item.status === 'GRADED' ? ` (${item.score} / ${item.assignment.maxScore})` : ''}`,
        at: item.submittedAt,
      })),
      { kind: 'ENROLLED' as const, label: 'Se inscribió', at: enrollment.enrolledAt },
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 8);

    return {
      enrollmentId,
      lessons: lessons.map((lesson) => ({ id: lesson.id, title: lesson.title, done: doneIds.has(lesson.id) })),
      weeks: weeklyCounts(
        done.map((item) => item.completedAt),
        now,
      ),
      events,
    };
  }

  /**
   * El docente le recuerda a un estudiante que siga su curso: le llega un aviso en la plataforma. Máximo uno
   * por persona y curso al día (para no llenarlo de avisos), y no tiene sentido si ya terminó o canceló.
   */
  async remind(user: AuthenticatedUser, enrollmentId: number, now = new Date()) {
    const enrollment = await this.repository.findEnrollment(enrollmentId);

    if (!enrollment) {
      throw new NotFoundException('La inscripción no existe');
    }

    await this.access.assertCanManage(user, enrollment.courseId);

    if (
      enrollment.status === EnrollmentStatus.CANCELLED ||
      enrollment.status === EnrollmentStatus.COMPLETED ||
      enrollment.completedAt
    ) {
      throw new BadRequestException('Esta persona ya terminó o canceló el curso: no necesita recordatorio');
    }

    const sent = await this.notifications.notifyOnce(
      enrollment.userId,
      {
        type: 'COURSE_REMINDER',
        title: 'Tu docente te recuerda tu curso',
        message: `Llevas un tiempo sin avanzar en «${enrollment.course.title}». ¡Retómalo cuando puedas!`,
        courseId: enrollment.courseId,
      },
      `teacher-reminder:${enrollment.id}:${now.toISOString().slice(0, 10)}`,
    );

    if (!sent) {
      throw new ConflictException('Ya le enviaste un recordatorio hoy a esta persona');
    }

    return { sent: true };
  }

  private async previousCounts(scope: Scope, period: Period, courseId: number | undefined, now: Date) {
    const window = courseId === undefined ? previousWindow(period, now) : undefined;

    return window ? this.repository.countsBetween(scope, window.from, window.to) : null;
  }

  /**
   * Invita a dejar una reseña a quienes terminaron un curso y aún no lo reseñaron (todos mis cursos o
   * uno solo). A cada persona se le avisa una sola vez por curso; si ya se le invitó, no se repite.
   */
  async requestReviews(user: AuthenticatedUser, options: { courseId?: number } = {}) {
    if (options.courseId !== undefined) {
      await this.access.assertCanManage(user, options.courseId);
    }

    const scope: Scope = {
      teacherId: user.role === Role.ADMIN ? undefined : user.id,
      courseId: options.courseId,
    };
    const candidates = await this.repository.completedWithoutReview(scope);
    let sent = 0;

    for (const candidate of candidates) {
      const created = await this.notifications.notifyOnce(
        candidate.userId,
        {
          type: 'COURSE_REMINDER',
          title: 'Cuéntanos qué te pareció tu curso',
          message: `Terminaste «${candidate.title}». ¿Nos dejas una reseña? Ayuda a otros estudiantes.`,
          courseId: candidate.courseId,
        },
        `review-request:${candidate.courseId}:${candidate.userId}`,
      );

      if (created) sent += 1;
    }

    // `eligible`: cuántos terminaron sin reseñar; `sent`: a cuántos se les avisó ahora (el resto ya tenía el aviso).
    return { eligible: candidates.length, sent };
  }

  /** Reparto de las reseñas por estrellas (de 5 a 1) y las más recientes. */
  async ratings(
    user: AuthenticatedUser,
    options: { period?: Period; courseId?: number } = {},
    now = new Date(),
  ) {
    if (options.courseId !== undefined) {
      await this.access.assertCanManage(user, options.courseId);
    }

    const scope: Scope = {
      teacherId: user.role === Role.ADMIN ? undefined : user.id,
      courseId: options.courseId,
    };
    const { groups, recent } = await this.repository.ratingBreakdown(scope, sinceOf(options.period ?? 'all', now));
    const count = groups.reduce((sum, group) => sum + group.count, 0);
    const total = groups.reduce((sum, group) => sum + group.rating * group.count, 0);

    return {
      count,
      average: count === 0 ? null : Math.round((total / count) * 10) / 10,
      distribution: [5, 4, 3, 2, 1].map((stars) => {
        const found = groups.find((group) => group.rating === stars)?.count ?? 0;

        return { stars, count: found, percent: count === 0 ? 0 : Math.round((found / count) * 100) };
      }),
      recent: recent.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        student: `${review.user.firstName} ${review.user.lastName}`.trim(),
        course: review.course,
      })),
    };
  }
}
