import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { Role } from '../../generated/prisma/enums.js';
import {
  applyGrades,
  type AttemptItem,
  buildSnapshot,
  summarize,
} from './attempt-snapshot.js';
import {
  AnswerDto,
  CreateEvaluationDto,
  GradeAttemptDto,
  ListAttemptsQueryDto,
  QuestionDto,
  SubmitAttemptDto,
  UpdateEvaluationDto,
} from './dto/evaluation.dto.js';
import { EvaluationsRepository } from './evaluations.repository.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  type GivenAnswer,
  normalizeText,
  scoreAttempt,
  scoreOfItems,
  type ScorableQuestion,
} from './scoring.js';

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly repository: EvaluationsRepository,
    private readonly access: CourseAccessService,
    private readonly progress: ProgressService,
    private readonly notifications: NotificationsService,
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
    await this.access.assertContentAccess(user, { evaluationId: id });
    const reveal = this.access.canManage(user, course);

    const evaluation = await this.repository.findForView(id, reveal);

    if (!evaluation) {
      throw new NotFoundException('La evaluación no existe');
    }

    if (reveal) {
      return evaluation;
    }

    // En "completar palabra" las opciones SON las respuestas: el estudiante no las ve.
    return {
      ...evaluation,
      questions: evaluation.questions.map((q) =>
        q.type === 'FILL_BLANK' ? { ...q, options: [] } : q,
      ),
    };
  }

  async create(
    user: AuthenticatedUser,
    moduleId: number,
    dto: CreateEvaluationDto,
  ) {
    const courseId = await this.access.courseIdOfModule(moduleId);
    await this.access.assertCanManage(user, courseId);
    const questions = this.toQuestionCreate(dto.questions);

    return this.repository.create(
      {
        moduleId,
        title: dto.title,
        description: dto.description,
        passingScore: dto.passingScore,
      },
      questions,
    );
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateEvaluationDto) {
    const courseId = await this.access.courseIdOfEvaluation(id);
    await this.access.assertCanManage(user, courseId);

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
    await this.access.assertContentAccess(user, { evaluationId });

    if (!(await this.progress.isEnrolled(user.id, courseId))) {
      throw new ForbiddenException(
        'Debes estar inscrito en el curso para presentar la evaluación',
      );
    }

    const evaluation = await this.repository.findWithAnswers(evaluationId);

    if (!evaluation) {
      throw new NotFoundException('La evaluación no existe');
    }

    const given = new Map<number, GivenAnswer>();

    for (const answer of dto.answers) {
      if (given.has(answer.questionId)) {
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

      given.set(answer.questionId, this.toGivenAnswer(question, answer));
    }

    const scored = scoreAttempt(evaluation.questions, given);
    const items = buildSnapshot(evaluation.questions, given, scored.results);
    // Con preguntas abiertas por revisar la nota es provisional y todavía no aprueba.
    const passed =
      !scored.pendingReview && scored.score >= evaluation.passingScore;

    const attempt = await this.repository.createAttempt({
      evaluationId,
      userId: user.id,
      score: scored.score,
      passed,
      status: scored.pendingReview ? 'PENDING_REVIEW' : 'GRADED',
      answers: [...given].map(([questionId, answer]) => ({
        questionId,
        ...answer,
      })),
      results: items,
    });

    return {
      ...this.toStudentAttempt(attempt),
      earnedPoints: scored.earnedPoints,
      totalPoints: scored.totalPoints,
      passingScore: evaluation.passingScore,
    };
  }

  async myAttempts(user: AuthenticatedUser, evaluationId: number) {
    const courseId = await this.access.courseIdOfEvaluation(evaluationId);
    await this.access.assertCanView(user, courseId);

    const attempts = await this.repository.findAttempts(evaluationId, user.id);

    return attempts.map((attempt) => this.toStudentAttempt(attempt));
  }

  /** Bandeja del docente: intentos de sus cursos (o de todos, si es admin). */
  async listAttempts(user: AuthenticatedUser, query: ListAttemptsQueryDto) {
    if (query.courseId !== undefined) {
      await this.access.assertCanManage(user, query.courseId);
    }

    const { items, total } = await this.repository.findAttemptsForReview({
      teacherId: user.role === Role.ADMIN ? undefined : user.id,
      courseId: query.courseId,
      evaluationId: query.evaluationId,
      status: query.status,
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    });

    return {
      total,
      items: items.map((attempt) => ({
        id: attempt.id,
        status: attempt.status,
        score: attempt.score,
        passed: attempt.passed,
        createdAt: attempt.createdAt,
        gradedAt: attempt.gradedAt,
        student: attempt.user,
        evaluation: { id: attempt.evaluation.id, title: attempt.evaluation.title },
        course: attempt.evaluation.module.course,
      })),
    };
  }

  /** Detalle para revisar: cada pregunta con lo que respondió el estudiante y lo esperado. */
  async getAttempt(user: AuthenticatedUser, id: number) {
    const attempt = await this.findManagedAttempt(user, id);

    return this.toTeacherAttempt(attempt);
  }

  /** Califica (o corrige) las preguntas abiertas de un intento y recalcula la nota. */
  async gradeAttempt(
    user: AuthenticatedUser,
    id: number,
    dto: GradeAttemptDto,
  ) {
    const attempt = await this.findManagedAttempt(user, id);
    const current = this.snapshotOf(attempt);

    if (!current.some((item) => item.type === 'ESSAY')) {
      throw new BadRequestException(
        'Este intento no tiene preguntas abiertas para calificar',
      );
    }

    const items = applyGrades(current, dto.grades);
    const summary = summarize(items, attempt.evaluation.passingScore);

    await this.repository.saveGrading(id, {
      results: items,
      score: summary.score,
      passed: summary.passed,
      status: summary.pending ? 'PENDING_REVIEW' : 'GRADED',
      feedback: dto.feedback,
      gradedAt: summary.pending ? null : new Date(),
      gradedById: user.id,
    });

    // Se avisa cuando ya no queda nada por calificar, no a cada pregunta que se va revisando.
    if (!summary.pending) {
      await this.notifications.notify([attempt.user.id], {
        type: 'GRADED_QUIZ',
        title: `Revisaron tu quiz: ${summary.score} de 100`,
        message: `«${attempt.evaluation.title}» en «${attempt.evaluation.module.course.title}»`,
        courseId: attempt.evaluation.module.courseId,
        refId: attempt.evaluation.id,
      });
    }

    return this.getAttempt(user, id);
  }

  private async findManagedAttempt(user: AuthenticatedUser, id: number) {
    const attempt = await this.repository.findAttemptDetail(id);

    if (!attempt) {
      throw new NotFoundException('El intento no existe');
    }

    await this.access.assertCanManage(user, attempt.evaluation.module.courseId);

    return attempt;
  }

  /** Intentos anteriores a las preguntas abiertas no tienen foto: se tratan como sin preguntas. */
  private snapshotOf(attempt: { results: unknown }): AttemptItem[] {
    return Array.isArray(attempt.results)
      ? (attempt.results as AttemptItem[])
      : [];
  }

  private toTeacherAttempt(
    attempt: NonNullable<
      Awaited<ReturnType<EvaluationsRepository['findAttemptDetail']>>
    >,
  ) {
    const items = this.snapshotOf(attempt);
    const { earnedPoints, totalPoints } = scoreOfItems(items);

    return {
      id: attempt.id,
      status: attempt.status,
      score: attempt.score,
      passed: attempt.passed,
      feedback: attempt.feedback,
      createdAt: attempt.createdAt,
      gradedAt: attempt.gradedAt,
      student: attempt.user,
      evaluation: {
        id: attempt.evaluation.id,
        title: attempt.evaluation.title,
        passingScore: attempt.evaluation.passingScore,
      },
      course: {
        id: attempt.evaluation.module.courseId,
        title: attempt.evaluation.module.course.title,
      },
      earnedPoints,
      totalPoints,
      questions: items,
    };
  }

  /**
   * Lo que ve el estudiante de su intento. Nunca incluye la respuesta correcta:
   * solo si acertó, los puntos y el comentario del docente.
   */
  private toStudentAttempt(attempt: {
    id: number;
    evaluationId: number;
    score: number;
    passed: boolean;
    status: string;
    feedback: string | null;
    createdAt: Date;
    gradedAt: Date | null;
    results: unknown;
  }) {
    return {
      id: attempt.id,
      evaluationId: attempt.evaluationId,
      score: attempt.score,
      passed: attempt.passed,
      status: attempt.status,
      feedback: attempt.feedback,
      createdAt: attempt.createdAt,
      gradedAt: attempt.gradedAt,
      results: this.snapshotOf(attempt).map((item) => ({
        questionId: item.questionId,
        correct: item.correct,
        earned: item.earned,
        points: item.points,
        comment: item.comment ?? null,
      })),
    };
  }

  /** Valida la respuesta según el tipo de pregunta y la deja en su forma canónica. */
  private toGivenAnswer(
    question: ScorableQuestion,
    answer: AnswerDto,
  ): GivenAnswer {
    const id = question.id;

    if (question.type === 'FILL_BLANK' || question.type === 'ESSAY') {
      if (!answer.text?.trim()) {
        throw new BadRequestException(
          `La pregunta ${id} se responde con un texto (text)`,
        );
      }

      return { text: answer.text.trim() };
    }

    const optionIds = [
      ...new Set(
        answer.optionIds ?? (answer.optionId === undefined ? [] : [answer.optionId]),
      ),
    ];

    if (optionIds.length === 0) {
      throw new BadRequestException(
        `La pregunta ${id} se responde eligiendo opciones (optionIds)`,
      );
    }

    if (question.type !== 'MULTIPLE' && optionIds.length !== 1) {
      throw new BadRequestException(
        `La pregunta ${id} acepta una sola opción`,
      );
    }

    const foreign = optionIds.find(
      (optionId) => !question.options.some((o) => o.id === optionId),
    );

    if (foreign !== undefined) {
      throw new BadRequestException(
        `La opción ${foreign} no pertenece a la pregunta ${id}`,
      );
    }

    return { optionIds };
  }

  /**
   * Revisa cada pregunta según su tipo y devuelve las opciones definitivas.
   * Así el resto del código solo ve opciones: verdadero/falso y respuestas
   * aceptadas se guardan igual que una opción múltiple.
   */
  private normalizeQuestions(questions: QuestionDto[]) {
    return questions.map((question, index) => {
      const label = `La pregunta ${index + 1}`;
      const type = question.type ?? 'SINGLE';
      const options = question.options ?? [];

      if (type === 'TRUE_FALSE') {
        if (typeof question.isTrue !== 'boolean') {
          throw new BadRequestException(
            `${label} (verdadero o falso) necesita isTrue: true o false`,
          );
        }

        return {
          question,
          type,
          options: [
            { text: 'Verdadero', isCorrect: question.isTrue },
            { text: 'Falso', isCorrect: !question.isTrue },
          ],
        };
      }

      if (type === 'ESSAY') {
        return { question, type, options: [] };
      }

      if (type === 'FILL_BLANK') {
        const accepted = [
          ...new Map(
            (question.acceptedAnswers ?? []).map((a) => [normalizeText(a), a]),
          ).values(),
        ];

        if (accepted.length === 0) {
          throw new BadRequestException(
            `${label} (completar palabra) necesita al menos una respuesta en acceptedAnswers`,
          );
        }

        return {
          question,
          type,
          options: accepted.map((text) => ({ text, isCorrect: true })),
        };
      }

      if (options.length < 2) {
        throw new BadRequestException(`${label} necesita al menos 2 opciones`);
      }

      const correct = options.filter((o) => o.isCorrect).length;

      if (type === 'SINGLE' && correct !== 1) {
        throw new BadRequestException(
          `${label} debe tener exactamente una opción correcta`,
        );
      }

      if (type === 'MULTIPLE' && (correct < 2 || correct === options.length)) {
        throw new BadRequestException(
          `${label} (varias respuestas) debe tener al menos 2 opciones correctas y al menos 1 incorrecta`,
        );
      }

      return { question, type, options };
    });
  }

  private toQuestionCreate(questions: QuestionDto[]) {
    return this.normalizeQuestions(questions).map(
      ({ question, type, options }, index) => ({
        text: question.text,
        type,
        points: question.points,
        position: index + 1,
        options: {
          create: options.map((o) => ({
            text: o.text,
            isCorrect: o.isCorrect,
          })),
        },
      }),
    );
  }
}
