import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import {
  CourseStatus,
  CourseVisibility,
  Role,
} from '../../generated/prisma/enums.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { ListReviewsQueryDto, SaveReviewDto } from './dto/review.dto.js';
import {
  publicName,
  summarizeRatings,
  weightedAverage,
} from './reviews-calc.js';
import { ReviewsRepository } from './reviews.repository.js';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly repository: ReviewsRepository,
    private readonly access: CourseAccessService,
    private readonly progress: ProgressService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- Vista pública ---

  /** Reseñas de un curso publicado. Sin apellido completo: solo la inicial. */
  async listPublic(courseId: number, query: ListReviewsQueryDto) {
    await this.assertPublic(courseId);

    const { items, total } = await this.repository.findByCourse(courseId, {
      rating: query.rating,
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    });

    return {
      total,
      items: items.map(({ user, ...review }) => ({
        ...review,
        author: publicName(user.firstName, user.lastName),
      })),
    };
  }

  /** Promedio, cantidad y distribución por estrellas de un curso publicado. */
  async summary(courseId: number) {
    await this.assertPublic(courseId);

    return summarizeRatings(await this.repository.ratingCounts(courseId));
  }

  /**
   * Para otros módulos (catálogo de cursos): promedio y cantidad de reseñas de varios cursos.
   * Un curso sin reseñas trae `{ average: null, count: 0 }`.
   */
  async ratingsOf(
    courseIds: number[],
  ): Promise<Map<number, { average: number | null; count: number }>> {
    const rows =
      courseIds.length === 0 ? [] : await this.repository.averagesOf(courseIds);
    const byCourse = new Map(rows.map((row) => [row.courseId, row]));

    return new Map(
      courseIds.map((id) => {
        const row = byCourse.get(id);

        return [
          id,
          {
            average: row ? weightedAverage([row]) : null,
            count: row?.count ?? 0,
          },
        ];
      }),
    );
  }

  // --- Estudiante ---

  /** Crea o reemplaza la reseña del estudiante. Solo puede reseñar quien está inscrito. */
  async saveMine(user: AuthenticatedUser, courseId: number, dto: SaveReviewDto) {
    const course = await this.access.assertCanView(user, courseId);

    if (!(await this.progress.isEnrolled(user.id, courseId))) {
      throw new ForbiddenException(
        'Debes estar inscrito en el curso para dejar una reseña',
      );
    }

    const existing = await this.repository.findMine(courseId, user.id);
    const review = await this.repository.save(courseId, user.id, {
      rating: dto.rating,
      comment: dto.comment || null,
    });

    // Solo la primera vez: editar una reseña no vuelve a avisar al docente.
    if (!existing) {
      await this.notifications.notify(
        [course.teacherId],
        {
          type: 'NEW_REVIEW',
          title: `Nueva reseña: ${dto.rating} de 5`,
          message: dto.comment
            ? `En «${course.title}»: ${dto.comment.slice(0, 100)}`
            : `En «${course.title}»`,
          courseId,
          refId: review.id,
        },
        user.id,
      );
    }

    return review;
  }

  async mine(user: AuthenticatedUser, courseId: number) {
    await this.access.assertCanView(user, courseId);

    const review = await this.repository.findMine(courseId, user.id);

    if (!review) {
      throw new NotFoundException('Todavía no has reseñado este curso');
    }

    return review;
  }

  async removeMine(user: AuthenticatedUser, courseId: number) {
    await this.access.assertCanView(user, courseId);

    if ((await this.repository.deleteMine(courseId, user.id)) === 0) {
      throw new NotFoundException('Todavía no has reseñado este curso');
    }

    return { deleted: true };
  }

  // --- Docente ---

  /** Reseñas de los cursos del docente (o de todos, si es admin). */
  async listForTeacher(user: AuthenticatedUser, query: ListReviewsQueryDto) {
    if (query.courseId !== undefined) {
      await this.access.assertCanManage(user, query.courseId);
    }

    const { items, total } = await this.repository.findForTeacher({
      teacherId: user.role === Role.ADMIN ? undefined : user.id,
      courseId: query.courseId,
      rating: query.rating,
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    });

    return {
      total,
      items: items.map(({ user: student, ...review }) => ({
        ...review,
        student,
      })),
    };
  }

  /** Lo público solo existe para cursos publicados y no privados; para el resto, "no existe". */
  private async assertPublic(courseId: number) {
    const course = await this.access.getCourseOrThrow(courseId);

    if (
      course.status !== CourseStatus.PUBLISHED ||
      course.visibility === CourseVisibility.PRIVATE
    ) {
      throw new NotFoundException('El curso no existe');
    }
  }
}
