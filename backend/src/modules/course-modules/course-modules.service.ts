import { Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { CourseModulesRepository } from './course-modules.repository.js';
import {
  CreateCourseModuleDto,
  UpdateCourseModuleDto,
} from './dto/course-module.dto.js';

@Injectable()
export class CourseModulesService {
  constructor(
    private readonly repository: CourseModulesRepository,
    private readonly access: CourseAccessService,
  ) {}

  async listByCourse(user: AuthenticatedUser, courseId: number) {
    await this.access.assertCanView(user, courseId);

    return this.repository.findByCourse(courseId);
  }

  /** Para otros módulos (courses): árbol de módulos y lecciones sin permisos. */
  outline(courseId: number, fullLessons = false) {
    return this.repository.findByCourse(courseId, fullLessons);
  }

  /** Para otros módulos (courses): ¿tiene contenido para publicarse? */
  countByCourse(courseId: number) {
    return this.repository.countByCourse(courseId);
  }

  async create(
    user: AuthenticatedUser,
    courseId: number,
    dto: CreateCourseModuleDto,
  ) {
    await this.access.assertCanManage(user, courseId);

    const position =
      dto.position ?? (await this.repository.maxPosition(courseId)) + 1;

    return this.repository.create({
      courseId,
      title: dto.title,
      description: dto.description,
      position,
    });
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateCourseModuleDto) {
    const courseId = await this.access.courseIdOfModule(id);
    await this.access.assertCanManage(user, courseId);

    return this.repository.update(id, {
      title: dto.title,
      description: dto.description,
      position: dto.position,
    });
  }

  async remove(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfModule(id);
    await this.access.assertCanManage(user, courseId);

    await this.repository.delete(id);

    return { deleted: true };
  }
}
