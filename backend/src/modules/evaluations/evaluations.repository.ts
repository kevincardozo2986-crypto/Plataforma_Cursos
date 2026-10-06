import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AttemptStatus } from '../../generated/prisma/enums.js';
import type { AttemptItem } from './attempt-snapshot.js';

interface EvaluationData {
  title?: string;
  description?: string;
  passingScore?: number;
}

interface QuestionCreate {
  text: string;
  type: 'TRUE_FALSE' | 'SINGLE' | 'MULTIPLE' | 'FILL_BLANK' | 'ESSAY';
  points?: number;
  position: number;
  options: { create: { text: string; isCorrect: boolean }[] };
}

const withQuestions = { questions: { include: { options: true } } } as const;

@Injectable()
export class EvaluationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByModule(moduleId: number) {
    return this.prisma.evaluation.findMany({
      where: { moduleId },
      orderBy: { id: 'asc' },
      include: { _count: { select: { questions: true } } },
    });
  }

  /** `revealCorrect=false` oculta `isCorrect` (vista del estudiante). */
  findForView(id: number, revealCorrect: boolean) {
    return this.prisma.evaluation.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { position: 'asc' },
          include: {
            options: {
              orderBy: { id: 'asc' },
              select: { id: true, text: true, isCorrect: revealCorrect },
            },
          },
        },
      },
    });
  }

  findWithAnswers(id: number) {
    return this.prisma.evaluation.findUnique({
      where: { id },
      include: withQuestions,
    });
  }

  create(
    data: EvaluationData & { moduleId: number; title: string },
    questions: QuestionCreate[],
  ) {
    return this.prisma.evaluation.create({
      data: { ...data, questions: { create: questions } },
      include: withQuestions,
    });
  }

  /** Si `questions` viene, reemplaza todas las preguntas en una transacción. */
  update(id: number, data: EvaluationData, questions?: QuestionCreate[]) {
    return this.prisma.$transaction(async (tx) => {
      if (questions) {
        await tx.question.deleteMany({ where: { evaluationId: id } });
      }

      return tx.evaluation.update({
        where: { id },
        data: {
          ...data,
          ...(questions ? { questions: { create: questions } } : {}),
        },
        include: withQuestions,
      });
    });
  }

  delete(id: number) {
    return this.prisma.evaluation.delete({ where: { id } });
  }

  createAttempt(data: {
    evaluationId: number;
    userId: number;
    score: number;
    passed: boolean;
    status: AttemptStatus;
    answers: { questionId: number; optionIds?: number[]; text?: string }[];
    results: AttemptItem[];
  }) {
    return this.prisma.evaluationAttempt.create({
      data: { ...data, results: data.results as unknown as Prisma.InputJsonValue },
    });
  }

  findAttempts(evaluationId: number, userId: number) {
    return this.prisma.evaluationAttempt.findMany({
      where: { evaluationId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Intentos para revisar. Un docente ve los de sus cursos (`teacherId`); un admin, todos.
   * `courseId` ya debe haberse comprobado que el usuario puede gestionarlo.
   */
  async findAttemptsForReview(filter: {
    teacherId?: number;
    courseId?: number;
    evaluationId?: number;
    status?: AttemptStatus;
    take: number;
    skip: number;
  }) {
    const where: Prisma.EvaluationAttemptWhereInput = {
      status: filter.status,
      evaluationId: filter.evaluationId,
      evaluation: {
        module: {
          courseId: filter.courseId,
          course: filter.teacherId ? { teacherId: filter.teacherId } : undefined,
        },
      },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.evaluationAttempt.findMany({
        where,
        // Primero lo pendiente; dentro de cada grupo, lo más reciente.
        orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
        take: filter.take,
        skip: filter.skip,
        select: {
          id: true,
          score: true,
          passed: true,
          status: true,
          createdAt: true,
          gradedAt: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          evaluation: {
            select: {
              id: true,
              title: true,
              module: {
                select: { course: { select: { id: true, title: true } } },
              },
            },
          },
        },
      }),
      this.prisma.evaluationAttempt.count({ where }),
    ]);

    return { items, total };
  }

  findAttemptDetail(id: number) {
    return this.prisma.evaluationAttempt.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        evaluation: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            module: {
              select: { courseId: true, course: { select: { title: true } } },
            },
          },
        },
      },
    });
  }

  saveGrading(
    id: number,
    data: {
      results: AttemptItem[];
      score: number;
      passed: boolean;
      status: AttemptStatus;
      feedback?: string;
      gradedAt: Date | null;
      gradedById: number;
    },
  ) {
    return this.prisma.evaluationAttempt.update({
      where: { id },
      data: { ...data, results: data.results as unknown as Prisma.InputJsonValue },
    });
  }
}
