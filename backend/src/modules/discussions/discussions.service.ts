import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProgressService } from '../progress/progress.service.js';
import {
  CreateCommentDto,
  CreateQuestionDto,
  CreateReplyDto,
  ListDiscussionsQueryDto,
  UpdatePostDto,
} from './dto/discussion.dto.js';
import { DiscussionsRepository } from './discussions.repository.js';

/** Primeros caracteres de un mensaje, para el texto de una notificación. */
const snippet = (text: string, max = 100) =>
  text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

@Injectable()
export class DiscussionsService {
  constructor(
    private readonly repository: DiscussionsRepository,
    private readonly access: CourseAccessService,
    private readonly progress: ProgressService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Publicaciones raíz (preguntas o comentarios) según quién pregunta: un docente ve las de
   * sus cursos, un administrador las de todos, y un estudiante las de los cursos donde está
   * inscrito. Filtros: `kind`, `courseId`, `lessonId`, `answered`.
   */
  async list(user: AuthenticatedUser, query: ListDiscussionsQueryDto) {
    let scope: { teacherId: number } | { courseIds: number[] } | null = null;

    if (user.role === Role.STUDENT) {
      const enrolled = await this.progress.enrolledCourseIds(user.id);

      if (query.courseId !== undefined && !enrolled.includes(query.courseId)) {
        throw new ForbiddenException(
          'Debes estar inscrito en el curso para ver sus conversaciones',
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

    return this.repository.findRoots({
      kind: query.kind,
      courseId: query.courseId,
      lessonId: query.lessonId,
      answered: query.answered,
      scope,
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    });
  }

  /** Una pregunta o comentario con todas sus respuestas. */
  async findOne(user: AuthenticatedUser, id: number) {
    const post = await this.repository.findRootWithReplies(id);

    if (!post) {
      throw new NotFoundException('La publicación no existe');
    }

    await this.assertCanParticipate(user, post.courseId);

    return post;
  }

  /** Una pregunta del curso (P y R). Avisa al docente. */
  async askQuestion(
    user: AuthenticatedUser,
    courseId: number,
    dto: CreateQuestionDto,
  ) {
    const course = await this.assertCanParticipate(user, courseId);

    if (!course.qaEnabled) {
      throw new ForbiddenException(
        'Las preguntas y respuestas están desactivadas en este curso',
      );
    }

    if (
      dto.lessonId !== undefined &&
      (await this.access.courseIdOfLesson(dto.lessonId)) !== courseId
    ) {
      throw new BadRequestException('La lección no pertenece a este curso');
    }

    const post = await this.repository.createPost({
      kind: 'QUESTION',
      title: dto.title,
      body: dto.body,
      courseId,
      lessonId: dto.lessonId,
      authorId: user.id,
    });

    await this.notifications.notify(
      [course.teacherId],
      {
        type: 'NEW_QUESTION',
        title: dto.title,
        message: `Nueva pregunta en «${course.title}»`,
        courseId,
        refId: post.id,
      },
      user.id,
    );

    return post;
  }

  /** Un comentario en una lección. */
  async comment(
    user: AuthenticatedUser,
    lessonId: number,
    dto: CreateCommentDto,
  ) {
    const courseId = await this.access.courseIdOfLesson(lessonId);
    await this.assertCanParticipate(user, courseId);

    return this.repository.createPost({
      kind: 'COMMENT',
      body: dto.body,
      courseId,
      lessonId,
      authorId: user.id,
    });
  }

  /**
   * Responde a una pregunta o comentario. Si responde el docente del curso, la pregunta
   * queda como respondida. Avisa a quien escribió la publicación.
   */
  async reply(user: AuthenticatedUser, postId: number, dto: CreateReplyDto) {
    const root = await this.repository.findPost(postId);

    if (!root) {
      throw new NotFoundException('La publicación no existe');
    }

    if (root.parentId !== null) {
      throw new BadRequestException(
        'Responde a la publicación principal, no a una respuesta',
      );
    }

    const course = await this.assertCanParticipate(user, root.courseId);

    const reply = await this.repository.createPost({
      kind: root.kind,
      body: dto.body,
      courseId: root.courseId,
      lessonId: root.lessonId ?? undefined,
      authorId: user.id,
      parentId: root.id,
    });

    if (
      root.kind === 'QUESTION' &&
      !root.answered &&
      this.access.canManage(user, course)
    ) {
      await this.repository.setAnswered(root.id, true);
    }

    await this.notifications.notify(
      [root.authorId],
      {
        type: 'NEW_REPLY',
        title:
          root.kind === 'QUESTION'
            ? 'Respondieron tu pregunta'
            : 'Respondieron tu comentario',
        message: snippet(dto.body),
        courseId: root.courseId,
        refId: root.id,
      },
      user.id,
    );

    return reply;
  }

  /** Solo quien lo escribió puede editarlo. */
  async update(user: AuthenticatedUser, id: number, dto: UpdatePostDto) {
    const post = await this.getOrThrow(id);

    if (post.authorId !== user.id) {
      throw new ForbiddenException('Solo puedes editar tus propios mensajes');
    }

    if (dto.title !== undefined && post.kind !== 'QUESTION') {
      throw new BadRequestException('Solo las preguntas llevan título');
    }

    return this.repository.updatePost(id, { title: dto.title, body: dto.body });
  }

  /**
   * Lo borra quien lo escribió o quien gestiona el curso (moderar). Borrar una pregunta o
   * comentario borra también sus respuestas. Si se borra la respuesta del docente, la
   * pregunta vuelve a quedar sin responder.
   */
  async remove(user: AuthenticatedUser, id: number) {
    const post = await this.getOrThrow(id);
    const course = await this.access.getCourseOrThrow(post.courseId);

    if (post.authorId !== user.id && !this.access.canManage(user, course)) {
      throw new ForbiddenException(
        'Solo puedes borrar tus mensajes, o los de tu curso si eres su docente',
      );
    }

    await this.repository.deletePost(id);

    if (post.parentId !== null) {
      await this.refreshAnswered(post.parentId, course);
    }

    return { deleted: true };
  }

  // --- Internos ---

  private async getOrThrow(id: number) {
    const post = await this.repository.findPost(id);

    if (!post) {
      throw new NotFoundException('La publicación no existe');
    }

    return post;
  }

  /** Participa quien gestiona el curso o está inscrito en él. */
  private async assertCanParticipate(user: AuthenticatedUser, courseId: number) {
    const course = await this.access.getCourseOrThrow(courseId);

    if (
      !this.access.canManage(user, course) &&
      !(await this.progress.isEnrolled(user.id, courseId))
    ) {
      throw new ForbiddenException(
        'Debes estar inscrito en el curso para participar en sus conversaciones',
      );
    }

    return course;
  }

  /** Recalcula si una pregunta sigue respondida: ¿queda alguna respuesta del docente o un admin? */
  private async refreshAnswered(rootId: number, course: { teacherId: number }) {
    const root = await this.repository.findPost(rootId);

    if (!root || root.kind !== 'QUESTION') {
      return;
    }

    const authors = await this.repository.repliesAuthors(rootId);
    const answered = authors.some(
      ({ author }) =>
        author.id === course.teacherId || author.role === Role.ADMIN,
    );

    if (answered !== root.answered) {
      await this.repository.setAnswered(rootId, answered);
    }
  }
}
