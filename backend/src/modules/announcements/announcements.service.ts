import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { hasVisibleText } from '../../common/dto/sanitize-html.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { AnnouncementsRepository } from './announcements.repository.js';
import {
  CreateAnnouncementDto,
  ListAnnouncementsQueryDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto.js';

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly repository: AnnouncementsRepository,
    private readonly access: CourseAccessService,
    private readonly progress: ProgressService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Anuncios según quién pregunta: un docente ve los de sus cursos, un administrador los
   * de todos, y un estudiante los de los cursos donde está inscrito. `courseId` filtra por uno.
   */
  async list(user: AuthenticatedUser, query: ListAnnouncementsQueryDto) {
    let scope: { teacherId: number } | { courseIds: number[] } | null = null;

    if (user.role === Role.STUDENT) {
      const enrolled = await this.progress.enrolledCourseIds(user.id);

      if (query.courseId !== undefined && !enrolled.includes(query.courseId)) {
        throw new ForbiddenException(
          'Debes estar inscrito en el curso para ver sus anuncios',
        );
      }

      scope = { courseIds: enrolled };
    } else {
      if (query.courseId !== undefined) {
        await this.access.assertCanManage(user, query.courseId);
      }

      if (user.role === Role.TEACHER) {
        scope = { teacherId: user.id };
      }
    }

    return this.repository.findMany({
      courseId: query.courseId,
      scope,
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    });
  }

  /** Publica un anuncio y, salvo que se pida lo contrario, avisa a los inscritos del curso. */
  async create(
    user: AuthenticatedUser,
    courseId: number,
    dto: CreateAnnouncementDto,
  ) {
    const course = await this.access.assertCanManage(user, courseId);

    if (!hasVisibleText(dto.body)) {
      throw new BadRequestException('El anuncio no puede estar vacío');
    }

    const announcement = await this.repository.create({
      courseId,
      authorId: user.id,
      title: dto.title,
      body: dto.body,
    });

    const notified =
      dto.notify === false
        ? 0
        : await this.notifications.notify(
            await this.progress.enrolledUserIds(courseId),
            {
              type: 'ANNOUNCEMENT',
              title: dto.title,
              message: `Nuevo anuncio en «${course.title}»`,
              courseId,
              refId: announcement.id,
            },
            user.id,
          );

    return { ...announcement, notified };
  }

  async update(
    user: AuthenticatedUser,
    id: number,
    dto: UpdateAnnouncementDto,
  ) {
    const announcement = await this.getOrThrow(id);
    await this.access.assertCanManage(user, announcement.courseId);

    if (dto.body !== undefined && !hasVisibleText(dto.body)) {
      throw new BadRequestException('El anuncio no puede estar vacío');
    }

    return this.repository.update(id, { title: dto.title, body: dto.body });
  }

  async remove(user: AuthenticatedUser, id: number) {
    const announcement = await this.getOrThrow(id);
    await this.access.assertCanManage(user, announcement.courseId);

    await this.repository.delete(id);

    return { deleted: true };
  }

  private async getOrThrow(id: number) {
    const announcement = await this.repository.findById(id);

    if (!announcement) {
      throw new NotFoundException('El anuncio no existe');
    }

    return announcement;
  }
}
