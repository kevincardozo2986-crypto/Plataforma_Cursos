import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { CourseStatus } from '../../generated/prisma/enums.js';

interface CategoryData {
  name?: string;
  slug?: string;
  description?: string;
}

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { courses: { where: { status: CourseStatus.PUBLISHED } } },
        },
      },
    });
  }

  findById(id: number) {
    return this.prisma.category.findUnique({ where: { id } });
  }

  async exists(id: number): Promise<boolean> {
    const found = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });

    return found !== null;
  }

  findClash(name: string, slug: string, exceptId?: number) {
    return this.prisma.category.findFirst({
      where: {
        OR: [{ name }, { slug }],
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
  }

  create(data: { name: string; slug: string; description?: string }) {
    return this.prisma.category.create({ data });
  }

  update(id: number, data: CategoryData) {
    return this.prisma.category.update({ where: { id }, data });
  }

  delete(id: number) {
    return this.prisma.category.delete({ where: { id } });
  }
}
