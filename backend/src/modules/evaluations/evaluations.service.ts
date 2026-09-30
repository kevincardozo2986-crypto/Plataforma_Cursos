import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { EnrollmentStatus } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessService } from '../courses/course-access.service.js';
import {
  CreateEvaluationDto,
  QuestionDto,
  SubmitAttemptDto,
  UpdateEvaluationDto,
} from './dto/evaluation.dto.js';

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  async listByModule(user: AuthenticatedUser, moduleId: number) {
    const courseId = await this.access.courseIdOfModule(moduleId);
    await this.access.assertCanView(user, courseId);

    return this.prisma.evaluation.findMany({
      where: { moduleId },
      orderBy: { id: 'asc' },
      include: { _count: { select: { questions: true } } },
    });
  }

  /** Los estudiantes no ven cuáles opciones son correctas. */
  async findOne(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfEvaluation(id);
    const course = await this.access.assertCanView(user, courseId);
    const reveal = this.access.canManage(user, course);

    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { position: 'asc' },
          include: {
            options: {
              orderBy: { id: 'asc' },
              select: { id: true, text: true, isCorrect: reveal },
            },
          },
        },
      },
    });

    if (!evaluation) {
      throw new NotFoundException('La evaluación no existe');
    }

    return evaluation;
  }

  async create(
    user: AuthenticatedUser,
    moduleId: number,
    dto: CreateEvaluationDto,
  ) {
    const courseId = await this.access.courseIdOfModule(moduleId);
    await this.access.assertCanManage(user, courseId);
    this.assertValidQuestions(dto.questions);

    return this.prisma.evaluation.create({
      data: {
        moduleId,
        title: dto.title,
        description: dto.description,
        passingScore: dto.passingScore,
        questions: { create: this.toQuestionCreate(dto.questions) },
      },
      include: { questions: { include: { options: true } } },
    });
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateEvaluationDto) {
    const courseId = await this.access.courseIdOfEvaluation(id);
    await this.access.assertCanManage(user, courseId);

    if (dto.questions) {
      this.assertValidQuestions(dto.questions);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.questions) {
        await tx.question.deleteMany({ where: { evaluationId: id } });
      }

      return tx.evaluation.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description,
          passingScore: dto.passingScore,
          ...(dto.questions
            ? { questions: { create: this.toQuestionCreate(dto.questions) } }
            : {}),
        },
        include: { questions: { include: { options: true } } },
      });
    });
  }

  async remove(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfEvaluation(id);
    await this.access.assertCanManage(user, courseId);

    await this.prisma.evaluation.delete({ where: { id } });

    return { deleted: true };
  }

  async submitAttempt(
    user: AuthenticatedUser,
    evaluationId: number,
    dto: SubmitAttemptDto,
  ) {
    const courseId = await this.access.courseIdOfEvaluation(evaluationId);
    await this.access.assertCanView(user, courseId);

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
      select: { status: true },
    });

    if (!enrollment || enrollment.status === EnrollmentStatus.CANCELLED) {
      throw new ForbiddenException(
        'Debes estar inscrito en el curso para presentar la evaluación',
      );
    }

    const evaluation = await this.prisma.evaluation.findUniqueOrThrow({
      where: { id: evaluationId },
      include: { questions: { include: { options: true } } },
    });

    const chosen = new Map<number, number>();

    for (const answer of dto.answers) {
      if (chosen.has(answer.questionId)) {
        throw new BadRequestException(
          `La pregunta ${answer.questionId} está respondida más de una vez`,
        );
      }

      const question = evaluation.questions.find(
        (q) => q.id === answer.questionId,
      );

      if (!question) {
        throw new BadRequestException(
          `La pregunta ${answer.questionId} no pertenece a esta evaluación`,
        );
      }

      if (!question.options.some((o) => o.id === answer.optionId)) {
        throw new BadRequestException(
          `La opción ${answer.optionId} no pertenece a la pregunta ${answer.questionId}`,
        );
      }

      chosen.set(answer.questionId, answer.optionId);
    }

    const totalPoints = evaluation.questions.reduce((sum, q) => sum + q.points, 0);
    const earnedPoints = evaluation.questions.reduce((sum, q) => {
      const optionId = chosen.get(q.id);
      const correct = q.options.find((o) => o.isCorrect);

      return optionId !== undefined && correct?.id === optionId
        ? sum + q.points
        : sum;
    }, 0);

    const score = totalPoints === 0 ? 0 : Math.round((earnedPoints / totalPoints) * 100);
    const passed = score >= evaluation.passingScore;

    const attempt = await this.prisma.evaluationAttempt.create({
      data: {
        evaluationId,
        userId: user.id,
        score,
        passed,
        answers: dto.answers.map((a) => ({
          questionId: a.questionId,
          optionId: a.optionId,
        })),
      },
    });

    return { ...attempt, earnedPoints, totalPoints, passingScore: evaluation.passingScore };
  }

  async myAttempts(user: AuthenticatedUser, evaluationId: number) {
    const courseId = await this.access.courseIdOfEvaluation(evaluationId);
    await this.access.assertCanView(user, courseId);

    return this.prisma.evaluationAttempt.findMany({
      where: { evaluationId, userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  private assertValidQuestions(questions: QuestionDto[]) {
    questions.forEach((question, index) => {
      const correct = question.options.filter((o) => o.isCorrect).length;

      if (correct !== 1) {
        throw new BadRequestException(
          `La pregunta ${index + 1} debe tener exactamente una opción correcta`,
        );
      }
    });
  }

  private toQuestionCreate(questions: QuestionDto[]) {
    return questions.map((question, index) => ({
      text: question.text,
      points: question.points,
      position: index + 1,
      options: {
        create: question.options.map((o) => ({
          text: o.text,
          isCorrect: o.isCorrect,
        })),
      },
    }));
  }
}
