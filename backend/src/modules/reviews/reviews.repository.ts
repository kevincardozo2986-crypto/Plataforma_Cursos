import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { RatingCount } from './reviews-calc.js';

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMine(courseId: number, userId: number) {
    return this.prisma.review.findUnique({
      where: { courseId_userId: { courseId, userId } },
      omit: { userId: true },
    });
  }

  /** Crea la reseña o, si ya existía, la reemplaza. */
  save(courseId: number, userId: number, data: { rating: number; comment: string | null }) {
    return this.prisma.review.upsert({
      where: { courseId_userId: { courseId, userId } },
      create: { courseId, userId, ...data },
      update: data,
      omit: { userId: true },
    });
  }

  async deleteMine(courseId: number, userId: number): Promise<number> {
    const result = await this.prisma.review.deleteMany({
      where: { courseId, userId },
    });

    return result.count;
  }

  /** Reseñas de un curso, de la más reciente a la más antigua. */
  async findByCourse(
    courseId: number,
    options: { rating?: number; take: number; skip: number },
  ) {
    const where = { courseId, rating: options.rating };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.take,
        skip: options.skip,
        include: { user: { select: { firstName: true, lastName: true } } },
        omit: { userId: true, courseId: true },
      }),
      this.prisma.review.count({ where }),
    ]);

    return { items, total };
  }

  /** Promedio y cantidad de reseñas de varios cursos a la vez (para el catálogo). */
  async averagesOf(courseIds: number[]) {
    const rows = await this.prisma.review.groupBy({
      by: ['courseId'],
      where: { courseId: { in: courseIds } },
      _avg: { rating: true },
      _count: { _all: true },
    });

    return rows.map((row) => ({
      courseId: row.courseId,
      average: row._avg.rating ?? 0,
      count: row._count._all,
    }));
  }

  async ratingCounts(courseId: number): Promise<RatingCount[]> {
    const rows = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { courseId },
      _count: { _all: true },
    });

    return rows.map((row) => ({ rating: row.rating, count: row._count._all }));
  }

  /**
   * Reseñas para el docente: las de sus cursos (`teacherId`) o, si es admin, las de todos.
   * `courseId` ya debe haberse comprobado que el usuario puede gestionarlo.
   */
  async findForTeacher(options: {
    teacherId?: number;
    courseId?: number;
    rating?: number;
    take: number;
    skip: number;
  }) {
    const where = {
      rating: options.rating,
      courseId: options.courseId,
      ...(options.teacherId ? { course: { teacherId: options.teacherId } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.take,
        skip: options.skip,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          course: { select: { id: true, title: true } },
        },
        omit: { userId: true, courseId: true },
      }),
      this.prisma.review.count({ where }),
    ]);

    return { items, total };
  }
}
