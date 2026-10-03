import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

interface LessonData {
  title?: string;
  content?: string;
  videoUrl?: string;
  durationMinutes?: number;
  position?: number;
}

@Injectable()
export class LessonsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByModule(moduleId: number) {
    return this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { position: 'asc' },
    });
  }

  findByIdWithResources(id: number) {
    return this.prisma.lesson.findUnique({
      where: { id },
      include: { resources: { orderBy: { id: 'asc' } } },
    });
  }

  async idsByCourse(courseId: number): Promise<number[]> {
    const lessons = await this.prisma.lesson.findMany({
      where: { module: { courseId } },
      select: { id: true },
    });

    return lessons.map((lesson) => lesson.id);
  }

  async maxPosition(moduleId: number): Promise<number> {
    const last = await this.prisma.lesson.aggregate({
      where: { moduleId },
      _max: { position: true },
    });

    return last._max.position ?? 0;
  }

  create(data: LessonData & { moduleId: number; title: string; position: number }) {
    return this.prisma.lesson.create({ data });
  }

  update(id: number, data: LessonData) {
    return this.prisma.lesson.update({ where: { id }, data });
  }

  delete(id: number) {
    return this.prisma.lesson.delete({ where: { id } });
  }
}
