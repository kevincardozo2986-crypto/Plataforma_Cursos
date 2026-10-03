import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { EnrollmentStatus } from '../../generated/prisma/enums.js';

@Injectable()
export class ProgressRepository {
  constructor(private readonly prisma: PrismaService) {}

  findEnrollment(userId: number, courseId: number) {
    return this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
  }

  countEnrollments(courseId: number) {
    return this.prisma.enrollment.count({ where: { courseId } });
  }

  createEnrollment(userId: number, courseId: number) {
    return this.prisma.enrollment.create({ data: { userId, courseId } });
  }

  updateEnrollment(
    id: number,
    data: { status?: EnrollmentStatus; completedAt?: Date | null },
  ) {
    return this.prisma.enrollment.update({ where: { id }, data });
  }

  findActiveByUser(userId: number) {
    return this.prisma.enrollment.findMany({
      where: { userId, status: { not: EnrollmentStatus.CANCELLED } },
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
  }

  findByCourse(courseId: number) {
    return this.prisma.enrollment.findMany({
      where: { courseId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  async completedLessonIds(
    enrollmentId: number,
    lessonIds: number[],
  ): Promise<number[]> {
    const done = await this.prisma.lessonProgress.findMany({
      where: { enrollmentId, lessonId: { in: lessonIds } },
      select: { lessonId: true },
    });

    return done.map((d) => d.lessonId);
  }

  markLessonDone(enrollmentId: number, lessonId: number) {
    return this.prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      create: { enrollmentId, lessonId },
      update: {},
    });
  }

  unmarkLesson(enrollmentId: number, lessonId: number) {
    return this.prisma.lessonProgress.deleteMany({
      where: { enrollmentId, lessonId },
    });
  }
}
