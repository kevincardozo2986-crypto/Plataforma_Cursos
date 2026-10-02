import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  CourseStatus,
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

  async enroll(user: AuthenticatedUser, courseId: number) {
    const course = await this.access.getCourseOrThrow(courseId);

    if (course.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException('El curso no existe');
    }

    const existing = await this.repository.findEnrollment(user.id, courseId);

    if (existing && existing.status !== EnrollmentStatus.CANCELLED) {
      throw new ConflictException('Ya estás inscrito en este curso');
    }

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
