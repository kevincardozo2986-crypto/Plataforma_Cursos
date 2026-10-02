import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import {
  CourseLevel,
  CourseStatus,
} from '../../generated/prisma/enums.js';

const teacherSelect = { id: true, firstName: true, lastName: true } as const;
const listInclude = {
  category: true,
  teacher: { select: teacherSelect },
} as const;

export interface PublishedFilter {
  categoryId?: number;
  level?: CourseLevel;
  search?: string;
}

interface CourseData {
  title?: string;
  description?: string;
  imageUrl?: string;
  price?: number;
  level?: CourseLevel;
  categoryId?: number;
}

@Injectable()
export class CoursesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(filter: PublishedFilter, skip: number, take: number) {
    const where = {
      status: CourseStatus.PUBLISHED,
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.level ? { level: filter.level } : {}),
      ...(filter.search
        ? {
            OR: [
              {
                title: { contains: filter.search, mode: 'insensitive' as const },
              },
              {
                description: {
                  contains: filter.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        include: listInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.course.count({ where }),
    ]);

    return { data, total };
  }

  findPublishedById(id: number) {
    return this.prisma.course.findFirst({
      where: { id, status: CourseStatus.PUBLISHED },
      include: listInclude,
    });
  }

  /** `teacherId` undefined = todos los cursos (admin). */
  listManaged(teacherId?: number) {
    return this.prisma.course.findMany({
      where: teacherId === undefined ? {} : { teacherId },
      include: listInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  findById(id: number) {
    return this.prisma.course.findUnique({
      where: { id },
      include: listInclude,
    });
  }

  async slugExists(slug: string): Promise<boolean> {
    const found = await this.prisma.course.findUnique({
      where: { slug },
      select: { id: true },
    });

    return found !== null;
  }

  create(data: CourseData & { title: string; description: string; price: number; slug: string; teacherId: number }) {
    return this.prisma.course.create({ data });
  }

  update(id: number, data: CourseData) {
    return this.prisma.course.update({ where: { id }, data });
  }

  updateStatus(id: number, status: CourseStatus) {
    return this.prisma.course.update({ where: { id }, data: { status } });
  }

  delete(id: number) {
    return this.prisma.course.delete({ where: { id } });
  }
}
