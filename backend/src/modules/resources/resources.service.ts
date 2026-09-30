import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessService } from '../courses/course-access.service.js';
import { CreateResourceDto, UpdateResourceDto } from './dto/resource.dto.js';

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  async listByLesson(user: AuthenticatedUser, lessonId: number) {
    const courseId = await this.access.courseIdOfLesson(lessonId);
    await this.access.assertCanView(user, courseId);

    return this.prisma.resource.findMany({
      where: { lessonId },
      orderBy: { id: 'asc' },
    });
  }

  async create(
    user: AuthenticatedUser,
    lessonId: number,
    dto: CreateResourceDto,
  ) {
    const courseId = await this.access.courseIdOfLesson(lessonId);
    await this.access.assertCanManage(user, courseId);

    return this.prisma.resource.create({
      data: { lessonId, title: dto.title, type: dto.type, url: dto.url },
    });
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateResourceDto) {
    const courseId = await this.access.courseIdOfResource(id);
    await this.access.assertCanManage(user, courseId);

    return this.prisma.resource.update({
      where: { id },
      data: { title: dto.title, type: dto.type, url: dto.url },
    });
  }

  async remove(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfResource(id);
    await this.access.assertCanManage(user, courseId);

    await this.prisma.resource.delete({ where: { id } });

    return { deleted: true };
  }
}
