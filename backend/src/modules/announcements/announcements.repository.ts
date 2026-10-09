import { Injectable } from '@nestjs/common';

import { managedBy } from '../../common/prisma/managed-by.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class AnnouncementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { courseId: number; authorId: number; title: string; body: string }) {
    return this.prisma.announcement.create({ data });
  }

  findById(id: number) {
    return this.prisma.announcement.findUnique({ where: { id } });
  }

  update(id: number, data: { title?: string; body?: string }) {
    return this.prisma.announcement.update({ where: { id }, data });
  }

  delete(id: number) {
    return this.prisma.announcement.delete({ where: { id } });
  }

  /**
   * Anuncios, del más reciente al más antiguo. `scope` limita a qué cursos se mira:
   * los de un docente, los que un estudiante tiene inscritos, o ninguno (admin).
   */
  async findMany(options: {
    courseId?: number;
    scope: { teacherId: number } | { courseIds: number[] } | null;
    take: number;
    skip: number;
  }) {
    const where: Prisma.AnnouncementWhereInput = {
      courseId: options.courseId,
      ...(options.scope && 'teacherId' in options.scope
        ? { course: managedBy(options.scope.teacherId) }
        : {}),
      ...(options.scope && 'courseIds' in options.scope
        ? { courseId: options.courseId ?? { in: options.scope.courseIds } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.take,
        skip: options.skip,
        include: {
          author: { select: { id: true, firstName: true, lastName: true } },
          course: { select: { id: true, title: true } },
        },
        omit: { authorId: true, courseId: true },
      }),
      this.prisma.announcement.count({ where }),
    ]);

    return { items, total };
  }
}
