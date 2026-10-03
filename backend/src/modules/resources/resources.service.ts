import { Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { CreateResourceDto, UpdateResourceDto } from './dto/resource.dto.js';
import { ResourcesRepository } from './resources.repository.js';

@Injectable()
export class ResourcesService {
  constructor(
    private readonly repository: ResourcesRepository,
    private readonly access: CourseAccessService,
  ) {}

  async listByLesson(user: AuthenticatedUser, lessonId: number) {
    const courseId = await this.access.courseIdOfLesson(lessonId);
    await this.access.assertCanView(user, courseId);

    return this.repository.findByLesson(lessonId);
  }

  async create(
    user: AuthenticatedUser,
    lessonId: number,
    dto: CreateResourceDto,
  ) {
    const courseId = await this.access.courseIdOfLesson(lessonId);
    await this.access.assertCanManage(user, courseId);

    return this.repository.create({
      lessonId,
      title: dto.title,
      type: dto.type,
      url: dto.url,
    });
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateResourceDto) {
    const courseId = await this.access.courseIdOfResource(id);
    await this.access.assertCanManage(user, courseId);

    return this.repository.update(id, {
      title: dto.title,
      type: dto.type,
      url: dto.url,
    });
  }

  async remove(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfResource(id);
    await this.access.assertCanManage(user, courseId);

    await this.repository.delete(id);

    return { deleted: true };
  }
}
