import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessService } from '../courses/course-access.service.js';
import { CreateLessonDto, UpdateLessonDto } from './dto/lesson.dto.js';

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  async listByModule(user: AuthenticatedUser, moduleId: number) {
    const courseId = await this.access.courseIdOfModule(moduleId);
    await this.access.assertCanView(user, courseId);

    return this.prisma.lesson.findMany({
      where: { moduleId },
      orderBy: { position: 'asc' },
    });
  }

  async findOne(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfLesson(id);
    await this.access.assertCanView(user, courseId);

    const lesson = await this.prisma.lesson.findUnique({
      where: { id },
      include: { resources: { orderBy: { id: 'asc' } } },
    });

    if (!lesson) {
      throw new NotFoundException('La lección no existe');
    }

    return lesson;
  }

  async create(user: AuthenticatedUser, moduleId: number, dto: CreateLessonDto) {
    const courseId = await this.access.courseIdOfModule(moduleId);
    await this.access.assertCanManage(user, courseId);

    const position = dto.position ?? (await this.nextPosition(moduleId));

    return this.prisma.lesson.create({
      data: {
        moduleId,
        title: dto.title,
        content: dto.content,
        videoUrl: dto.videoUrl,
        durationMinutes: dto.durationMinutes,
        position,
      },
    });
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateLessonDto) {
    const courseId = await this.access.courseIdOfLesson(id);
    await this.access.assertCanManage(user, courseId);

    return this.prisma.lesson.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        videoUrl: dto.videoUrl,
        durationMinutes: dto.durationMinutes,
        position: dto.position,
      },
    });
  }

  async remove(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfLesson(id);
    await this.access.assertCanManage(user, courseId);

    await this.prisma.lesson.delete({ where: { id } });

    return { deleted: true };
  }

  private async nextPosition(moduleId: number): Promise<number> {
    const last = await this.prisma.lesson.aggregate({
      where: { moduleId },
      _max: { position: true },
    });

    return (last._max.position ?? 0) + 1;
  }
}
