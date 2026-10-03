import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

interface ModuleData {
  title?: string;
  description?: string;
  position?: number;
}

@Injectable()
export class CourseModulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Módulos de un curso con sus lecciones (lectura del árbol de contenido). */
  findByCourse(courseId: number, fullLessons = false) {
    return this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: { position: 'asc' },
      include: {
        lessons: {
          orderBy: { position: 'asc' },
          ...(fullLessons
            ? {}
            : {
                select: {
                  id: true,
                  title: true,
                  position: true,
                  durationMinutes: true,
                },
              }),
        },
      },
    });
  }

  countByCourse(courseId: number) {
    return this.prisma.courseModule.count({ where: { courseId } });
  }

  async maxPosition(courseId: number): Promise<number> {
    const last = await this.prisma.courseModule.aggregate({
      where: { courseId },
      _max: { position: true },
    });

    return last._max.position ?? 0;
  }

  create(data: { courseId: number; title: string; description?: string; position: number }) {
    return this.prisma.courseModule.create({ data });
  }

  update(id: number, data: ModuleData) {
    return this.prisma.courseModule.update({ where: { id }, data });
  }

  delete(id: number) {
    return this.prisma.courseModule.delete({ where: { id } });
  }
}
