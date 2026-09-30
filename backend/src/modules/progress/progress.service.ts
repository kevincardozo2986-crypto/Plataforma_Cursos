import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import {
  CourseStatus,
  EnrollmentStatus,
} from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessService } from '../courses/course-access.service.js';

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  // --- Inscripciones ---

  async enroll(user: AuthenticatedUser, courseId: number) {
    const course = await this.access.getCourseOrThrow(courseId);

    if (course.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException('El curso no existe');
    }

    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
    });

    if (existing && existing.status !== EnrollmentStatus.CANCELLED) {
      throw new ConflictException('Ya estás inscrito en este curso');
    }

    if (existing) {
      return this.prisma.enrollment.update({
        where: { id: existing.id },
        data: { status: EnrollmentStatus.ACTIVE, completedAt: null },
      });
    }

    return this.prisma.enrollment.create({
      data: { userId: user.id, courseId },
    });
  }

  async cancel(user: AuthenticatedUser, courseId: number) {
    const enrollment = await this.getEnrollmentOrThrow(user.id, courseId);

    return this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: EnrollmentStatus.CANCELLED },
    });
  }

  async myEnrollments(user: AuthenticatedUser) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: user.id, status: { not: EnrollmentStatus.CANCELLED } },
      orderBy: { enrolledAt: 'desc' },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            imageUrl: true,
            level: true,
          },
        },
      },
    });

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

    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return Promise.all(
      enrollments.map(async (enrollment) => ({
        ...enrollment,
        progress: await this.computeProgress(enrollment.id, courseId),
      })),
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

    await this.prisma.lessonProgress.upsert({
      where: {
        enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId },
      },
      create: { enrollmentId: enrollment.id, lessonId },
      update: {},
    });

    const progress = await this.computeProgress(enrollment.id, courseId);

    if (
      progress.totalLessons > 0 &&
      progress.completedLessons === progress.totalLessons &&
      enrollment.status !== EnrollmentStatus.COMPLETED
    ) {
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: EnrollmentStatus.COMPLETED, completedAt: new Date() },
      });
    }

    return progress;
  }

  async uncompleteLesson(user: AuthenticatedUser, lessonId: number) {
    const courseId = await this.access.courseIdOfLesson(lessonId);
    const enrollment = await this.getActiveEnrollment(user.id, courseId);

    await this.prisma.lessonProgress.deleteMany({
      where: { enrollmentId: enrollment.id, lessonId },
    });

    if (enrollment.status === EnrollmentStatus.COMPLETED) {
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: EnrollmentStatus.ACTIVE, completedAt: null },
      });
    }

    return this.computeProgress(enrollment.id, courseId);
  }

  // --- Internos ---

  private async computeProgress(enrollmentId: number, courseId: number) {
    const [totalLessons, done] = await Promise.all([
      this.prisma.lesson.count({ where: { module: { courseId } } }),
      this.prisma.lessonProgress.findMany({
        where: { enrollmentId, lesson: { module: { courseId } } },
        select: { lessonId: true },
      }),
    ]);

    const completedLessons = done.length;

    return {
      totalLessons,
      completedLessons,
      percent:
        totalLessons === 0
          ? 0
          : Math.round((completedLessons / totalLessons) * 100),
      completedLessonIds: done.map((d) => d.lessonId),
    };
  }

  private async getEnrollmentOrThrow(userId: number, courseId: number) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });

    if (!enrollment || enrollment.status === EnrollmentStatus.CANCELLED) {
      throw new NotFoundException('No estás inscrito en este curso');
    }

    return enrollment;
  }

  private async getActiveEnrollment(userId: number, courseId: number) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });

    if (!enrollment || enrollment.status === EnrollmentStatus.CANCELLED) {
      throw new ForbiddenException(
        'Debes estar inscrito en el curso para registrar tu progreso',
      );
    }

    return enrollment;
  }
}
