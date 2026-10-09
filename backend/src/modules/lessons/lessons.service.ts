import { Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { CreateLessonDto, UpdateLessonDto } from './dto/lesson.dto.js';
import { LessonsRepository } from './lessons.repository.js';

@Injectable()
export class LessonsService {
  constructor(
    private readonly repository: LessonsRepository,
    private readonly access: CourseAccessService,
  ) {}

  async listByModule(user: AuthenticatedUser, moduleId: number) {
    const courseId = await this.access.courseIdOfModule(moduleId);
    await this.access.assertCanView(user, courseId);
    await this.access.assertContentAccess(user, { moduleId });

    return this.repository.findByModule(moduleId);
  }

  async findOne(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfLesson(id);
    await this.access.assertCanView(user, courseId);
    await this.access.assertContentAccess(user, { lessonId: id });

    const lesson = await this.repository.findByIdWithResources(id);

    if (!lesson) {
      throw new NotFoundException('La lección no existe');
    }

    return lesson;
  }

  /** Para otros módulos (progress): ids de todas las lecciones de un curso. */
  idsByCourse(courseId: number): Promise<number[]> {
    return this.repository.idsByCourse(courseId);
  }

  async create(user: AuthenticatedUser, moduleId: number, dto: CreateLessonDto) {
    const courseId = await this.access.courseIdOfModule(moduleId);
    await this.access.assertCanManage(user, courseId);

    const position =
      dto.position ?? (await this.repository.maxPosition(moduleId)) + 1;

    return this.repository.create({
      moduleId,
      title: dto.title,
      content: dto.content,
      videoUrl: dto.videoUrl,
      durationMinutes: dto.durationMinutes,
      position,
    });
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateLessonDto) {
    const courseId = await this.access.courseIdOfLesson(id);
    await this.access.assertCanManage(user, courseId);

    return this.repository.update(id, {
      title: dto.title,
      content: dto.content,
      videoUrl: dto.videoUrl,
      durationMinutes: dto.durationMinutes,
      position: dto.position,
    });
  }

  async remove(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfLesson(id);
    await this.access.assertCanManage(user, courseId);

    await this.repository.delete(id);

    return { deleted: true };
  }
}
