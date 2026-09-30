import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessService } from '../courses/course-access.service.js';
import {
  CreateCourseModuleDto,
  UpdateCourseModuleDto,
} from './dto/course-module.dto.js';

@Injectable()
export class CourseModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  async listByCourse(user: AuthenticatedUser, courseId: number) {
    await this.access.assertCanView(user, courseId);

    return this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: { position: 'asc' },
      include: {
        lessons: {
          orderBy: { position: 'asc' },
          select: { id: true, title: true, position: true, durationMinutes: true },
        },
      },
    });
  }

  async create(
    user: AuthenticatedUser,
    courseId: number,
    dto: CreateCourseModuleDto,
  ) {
    await this.access.assertCanManage(user, courseId);

    const position = dto.position ?? (await this.nextPosition(courseId));

    return this.prisma.courseModule.create({
      data: {
        courseId,
        title: dto.title,
        description: dto.description,
        position,
      },
    });
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateCourseModuleDto) {
    const courseId = await this.access.courseIdOfModule(id);
    await this.access.assertCanManage(user, courseId);

    return this.prisma.courseModule.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        position: dto.position,
      },
    });
  }

  async remove(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfModule(id);
    await this.access.assertCanManage(user, courseId);

    await this.prisma.courseModule.delete({ where: { id } });

    return { deleted: true };
  }

  private async nextPosition(courseId: number): Promise<number> {
    const last = await this.prisma.courseModule.aggregate({
      where: { courseId },
      _max: { position: true },
    });

    return (last._max.position ?? 0) + 1;
  }
}
