import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { ProgressService } from '../progress/progress.service.js';
import {
  CreateEvaluationDto,
  QuestionDto,
  SubmitAttemptDto,
  UpdateEvaluationDto,
} from './dto/evaluation.dto.js';
import { EvaluationsRepository } from './evaluations.repository.js';
import { scoreAttempt } from './scoring.js';

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly repository: EvaluationsRepository,
    private readonly access: CourseAccessService,
    private readonly progress: ProgressService,
  ) {}

  async listByModule(user: AuthenticatedUser, moduleId: number) {
    const courseId = await this.access.courseIdOfModule(moduleId);
    await this.access.assertCanView(user, courseId);

    return this.repository.findByModule(moduleId);
  }

  /** Los estudiantes no ven cuáles opciones son correctas. */
  async findOne(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfEvaluation(id);
    const course = await this.access.assertCanView(user, courseId);
    const reveal = this.access.canManage(user, course);

    const evaluation = await this.repository.findForView(id, reveal);

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

    return this.repository.create(
      {
        moduleId,
        title: dto.title,
        description: dto.description,
        passingScore: dto.passingScore,
      },
      this.toQuestionCreate(dto.questions),
    );
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateEvaluationDto) {
    const courseId = await this.access.courseIdOfEvaluation(id);
    await this.access.assertCanManage(user, courseId);

    if (dto.questions) {
      this.assertValidQuestions(dto.questions);
    }

    return this.repository.update(
      id,
      {
        title: dto.title,
        description: dto.description,
        passingScore: dto.passingScore,
      },
      dto.questions ? this.toQuestionCreate(dto.questions) : undefined,
    );
  }

  async remove(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfEvaluation(id);
    await this.access.assertCanManage(user, courseId);

    await this.repository.delete(id);

    return { deleted: true };
  }

  async submitAttempt(
    user: AuthenticatedUser,
    evaluationId: number,
    dto: SubmitAttemptDto,
  ) {
    const courseId = await this.access.courseIdOfEvaluation(evaluationId);
    await this.access.assertCanView(user, courseId);

    if (!(await this.progress.isEnrolled(user.id, courseId))) {
      throw new ForbiddenException(
        'Debes estar inscrito en el curso para presentar la evaluación',
      );
    }

    const evaluation = await this.repository.findWithAnswers(evaluationId);

    if (!evaluation) {
      throw new NotFoundException('La evaluación no existe');
    }

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

    const { score, earnedPoints, totalPoints } = scoreAttempt(
      evaluation.questions,
      chosen,
    );
    const passed = score >= evaluation.passingScore;

    const attempt = await this.repository.createAttempt({
      evaluationId,
      userId: user.id,
      score,
      passed,
      answers: dto.answers.map((a) => ({
        questionId: a.questionId,
        optionId: a.optionId,
      })),
    });

    return {
      ...attempt,
      earnedPoints,
      totalPoints,
      passingScore: evaluation.passingScore,
    };
  }

  async myAttempts(user: AuthenticatedUser, evaluationId: number) {
    const courseId = await this.access.courseIdOfEvaluation(evaluationId);
    await this.access.assertCanView(user, courseId);

    return this.repository.findAttempts(evaluationId, user.id);
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
