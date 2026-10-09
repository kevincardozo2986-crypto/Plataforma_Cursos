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

  /** Inscripciones que ocupan un cupo (las canceladas no). */
  countActiveEnrollments(courseId: number) {
    return this.prisma.enrollment.count({
      where: { courseId, status: { not: EnrollmentStatus.CANCELLED } },
    });
  }

  /** Ids de los estudiantes con inscripción vigente (activa o completada) en un curso. */
  async enrolledUserIds(courseId: number): Promise<number[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { courseId, status: { not: EnrollmentStatus.CANCELLED } },
      select: { userId: true },
    });

    return rows.map((row) => row.userId);
  }

  /** Ids de los cursos en los que el usuario tiene inscripción vigente. */
  async enrolledCourseIds(userId: number): Promise<number[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { userId, status: { not: EnrollmentStatus.CANCELLED } },
      select: { courseId: true },
    });

    return rows.map((row) => row.courseId);
  }

  /** De esos cursos, ids de los que el usuario ya completó. */
  async completedCourseIds(userId: number, courseIds: number[]): Promise<number[]> {
    const completed = await this.prisma.enrollment.findMany({
      where: {
        userId,
        courseId: { in: courseIds },
        status: EnrollmentStatus.COMPLETED,
      },
      select: { courseId: true },
    });

    return completed.map((item) => item.courseId);
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
