import { Injectable } from '@nestjs/common';

import { managedBy } from '../../common/prisma/managed-by.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { DiscussionKind } from '../../generated/prisma/enums.js';

const authorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
} as const;

@Injectable()
export class DiscussionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createPost(data: {
    kind: DiscussionKind;
    title?: string;
    body: string;
    courseId: number;
    lessonId?: number;
    authorId: number;
    parentId?: number;
  }) {
    return this.prisma.discussionPost.create({
      data,
      include: { author: { select: authorSelect } },
      omit: { authorId: true },
    });
  }

  /** La publicación tal cual está guardada (raíz o respuesta), para decidir permisos. */
  findPost(id: number) {
    return this.prisma.discussionPost.findUnique({ where: { id } });
  }

  /** Una publicación raíz con todas sus respuestas, de la más antigua a la más nueva. */
  findRootWithReplies(id: number) {
    return this.prisma.discussionPost.findFirst({
      where: { id, parentId: null },
      include: {
        author: { select: authorSelect },
        lesson: { select: { id: true, title: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: authorSelect } },
          omit: { authorId: true, title: true, answered: true },
        },
      },
      omit: { authorId: true },
    });
  }

  /**
   * Publicaciones raíz, de la más reciente a la más antigua. `scope` limita los cursos que se
   * miran: los de un docente, los que un estudiante tiene inscritos, o ninguno (admin).
   */
  async findRoots(options: {
    kind?: DiscussionKind;
    courseId?: number;
    lessonId?: number;
    answered?: boolean;
    scope: { teacherId: number } | { courseIds: number[] } | null;
    take: number;
    skip: number;
  }) {
    const where: Prisma.DiscussionPostWhereInput = {
      parentId: null,
      kind: options.kind,
      lessonId: options.lessonId,
      answered: options.answered,
      courseId: options.courseId,
      ...(options.scope && 'teacherId' in options.scope
        ? { course: managedBy(options.scope.teacherId) }
        : {}),
      ...(options.scope && 'courseIds' in options.scope
        ? { courseId: options.courseId ?? { in: options.scope.courseIds } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.discussionPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.take,
        skip: options.skip,
        include: {
          author: { select: authorSelect },
          course: { select: { id: true, title: true } },
          lesson: { select: { id: true, title: true } },
          _count: { select: { replies: true } },
        },
        omit: { authorId: true, courseId: true, lessonId: true },
      }),
      this.prisma.discussionPost.count({ where }),
    ]);

    return { items, total };
  }

  updatePost(id: number, data: { title?: string; body?: string }) {
    return this.prisma.discussionPost.update({
      where: { id },
      data,
      include: { author: { select: authorSelect } },
      omit: { authorId: true },
    });
  }

  deletePost(id: number) {
    return this.prisma.discussionPost.delete({ where: { id } });
  }

  setAnswered(id: number, answered: boolean) {
    return this.prisma.discussionPost.update({
      where: { id },
      data: { answered },
    });
  }

  /** Quién respondió a una publicación y con qué rol (para saber si ya contestó el docente). */
  repliesAuthors(parentId: number) {
    return this.prisma.discussionPost.findMany({
      where: { parentId },
      select: { author: { select: { id: true, role: true } } },
    });
  }
}
