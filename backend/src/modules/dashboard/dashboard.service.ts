import { Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseStatus, EnrollmentStatus, Role } from '../../generated/prisma/enums.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import {
  bucketOf,
  fillSeries,
  INACTIVE_DAYS,
  mergeSeries,
  type Period,
  percent,
  sinceOf,
} from './dashboard-calc.js';
import { DashboardRepository, type Scope } from './dashboard.repository.js';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(
    private readonly repository: DashboardRepository,
    private readonly access: CourseAccessService,
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
    ]);

    const count = (status: string) => enrollmentCounts.get(status) ?? 0;
    const active = count(EnrollmentStatus.ACTIVE);
    const completed = count(EnrollmentStatus.COMPLETED);
    const cancelled = count(EnrollmentStatus.CANCELLED);
    const enrolled = active + completed + cancelled;

    const scoreOf = new Map(scores.map((s) => [s.courseId, s.average]));

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
        };
      }),
    };
  }
}
