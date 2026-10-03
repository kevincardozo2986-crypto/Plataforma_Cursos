import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

interface EvaluationData {
  title?: string;
  description?: string;
  passingScore?: number;
}

interface QuestionCreate {
  text: string;
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
    answers: { questionId: number; optionId: number }[];
  }) {
    return this.prisma.evaluationAttempt.create({ data });
  }

  findAttempts(evaluationId: number, userId: number) {
    return this.prisma.evaluationAttempt.findMany({
      where: { evaluationId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
