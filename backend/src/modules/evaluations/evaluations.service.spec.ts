import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { Role } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { ProgressService } from '../progress/progress.service.js';
import type { QuestionDto } from './dto/evaluation.dto.js';
import type { EvaluationsRepository } from './evaluations.repository.js';
import { EvaluationsService } from './evaluations.service.js';

const student = { id: 5, role: Role.STUDENT } as AuthenticatedUser;
const teacher = { id: 7, role: Role.TEACHER } as AuthenticatedUser;

const evaluation = {
  id: 1,
  passingScore: 60,
  questions: [
    {
      id: 11,
      points: 1,
      type: 'SINGLE',
      options: [
        { id: 111, text: 'a', isCorrect: true },
        { id: 112, text: 'b', isCorrect: false },
      ],
    },
    {
      id: 12,
      points: 1,
      type: 'SINGLE',
      options: [
        { id: 121, text: 'a', isCorrect: false },
        { id: 122, text: 'b', isCorrect: true },
      ],
    },
    {
      id: 13,
      points: 1,
      type: 'MULTIPLE',
      options: [
        { id: 131, text: 'a', isCorrect: true },
        { id: 132, text: 'b', isCorrect: true },
        { id: 133, text: 'c', isCorrect: false },
      ],
    },
    {
      id: 14,
      points: 1,
      type: 'FILL_BLANK',
      options: [{ id: 141, text: 'Bogotá', isCorrect: true }],
    },
  ],
};

function build(findOne?: unknown) {
  const repository = {
    findWithAnswers: vi.fn().mockResolvedValue(evaluation),
    findForView: vi.fn().mockResolvedValue(findOne),
    createAttempt: vi.fn((data: unknown) => Promise.resolve({ id: 1, ...(data as object) })),
    create: vi.fn((_data: unknown, questions: unknown) => Promise.resolve({ id: 1, questions })),
  };
  const access = {
    courseIdOfEvaluation: vi.fn().mockResolvedValue(10),
    courseIdOfModule: vi.fn().mockResolvedValue(10),
    assertCanView: vi.fn().mockResolvedValue({}),
    assertCanManage: vi.fn().mockResolvedValue({}),
    canManage: vi.fn().mockReturnValue(false),
  };
  const progress = { isEnrolled: vi.fn().mockResolvedValue(true) };

  const service = new EvaluationsService(
    repository as unknown as EvaluationsRepository,
    access as unknown as CourseAccessService,
    progress as unknown as ProgressService,
  );

  return { service, repository, access, progress };
}

/** Respuestas que aciertan las cuatro preguntas del ejemplo. */
const allCorrect = [
  { questionId: 11, optionIds: [111] },
  { questionId: 12, optionId: 122 }, // atajo de una sola opción
  { questionId: 13, optionIds: [132, 131] },
  { questionId: 14, text: ' bogota ' },
];

describe('EvaluationsService', () => {
  describe('submitAttempt', () => {
    it('exige estar inscrito en el curso', async () => {
      const { service, progress } = build();
      progress.isEnrolled.mockResolvedValue(false);

      await expect(
        service.submitAttempt(student, 1, { answers: [{ questionId: 11, optionIds: [111] }] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('califica los cuatro tipos y aprueba con todo correcto', async () => {
      const { service, repository } = build();

      const result = await service.submitAttempt(student, 1, { answers: allCorrect });

      expect(result).toMatchObject({ score: 100, passed: true, totalPoints: 4 });
      expect(result.status).toBe('GRADED');
      expect(result.results.map((r) => r.correct)).toEqual([true, true, true, true]);
      // Lo que ve el estudiante nunca incluye la respuesta correcta.
      expect(JSON.stringify(result)).not.toContain('expected');
      expect(repository.createAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 5, evaluationId: 1, score: 100 }),
      );
    });

    it('reprueba si la nota queda bajo el mínimo', async () => {
      const { service } = build();

      const result = await service.submitAttempt(student, 1, {
        answers: [
          { questionId: 11, optionIds: [111] },
          { questionId: 12, optionIds: [121] },
        ],
      });

      expect(result).toMatchObject({ score: 25, passed: false });
    });

    it('rechaza una pregunta que no es de la evaluación', async () => {
      const { service, repository } = build();

      await expect(
        service.submitAttempt(student, 1, { answers: [{ questionId: 999, optionIds: [111] }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('rechaza una opción que pertenece a otra pregunta', async () => {
      const { service } = build();

      await expect(
        service.submitAttempt(student, 1, { answers: [{ questionId: 11, optionIds: [122] }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza responder la misma pregunta dos veces', async () => {
      const { service } = build();

      await expect(
        service.submitAttempt(student, 1, {
          answers: [
            { questionId: 11, optionIds: [111] },
            { questionId: 11, optionIds: [112] },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('una pregunta de una sola opción no acepta varias', async () => {
      const { service } = build();

      await expect(
        service.submitAttempt(student, 1, { answers: [{ questionId: 11, optionIds: [111, 112] }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('"completar palabra" exige un texto, y las demás exigen opciones', async () => {
      const { service } = build();

      await expect(
        service.submitAttempt(student, 1, { answers: [{ questionId: 14, optionIds: [141] }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.submitAttempt(student, 1, { answers: [{ questionId: 11, text: 'a' }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findOne', () => {
    const view = {
      id: 1,
      questions: [
        { id: 1, type: 'SINGLE', options: [{ id: 10, text: 'a' }] },
        { id: 2, type: 'FILL_BLANK', options: [{ id: 20, text: 'Bogotá' }] },
      ],
    };

    it('al estudiante no le muestra las respuestas aceptadas de "completar palabra"', async () => {
      const { service } = build(view);

      const result = await service.findOne(student, 1);

      expect(result.questions[0].options).toHaveLength(1);
      expect(result.questions[1].options).toEqual([]);
    });

    it('al docente sí se las muestra', async () => {
      const { service, access } = build(view);
      access.canManage.mockReturnValue(true);

      const result = await service.findOne(teacher, 1);

      expect(result.questions[1].options).toHaveLength(1);
    });
  });

  describe('create', () => {
    const create = (question: Partial<QuestionDto>) => {
      const { service, repository } = build();

      return {
        repository,
        run: () =>
          service.create(teacher, 1, {
            title: 'Quiz',
            questions: [{ text: 'Pregunta uno', ...question } as QuestionDto],
          }),
      };
    };

    const options = (...flags: boolean[]) =>
      flags.map((isCorrect, i) => ({ text: String(i), isCorrect }));

    it('SINGLE (por defecto) exige exactamente una opción correcta', async () => {
      await expect(create({ options: options(false, false) }).run()).rejects.toBeInstanceOf(BadRequestException);
      await expect(create({ options: options(true, true) }).run()).rejects.toBeInstanceOf(BadRequestException);
      await expect(create({ options: options(true, false) }).run()).resolves.toBeDefined();
    });

    it('exige al menos 2 opciones', async () => {
      await expect(create({ options: options(true) }).run()).rejects.toBeInstanceOf(BadRequestException);
      await expect(create({}).run()).rejects.toBeInstanceOf(BadRequestException);
    });

    it('MULTIPLE exige 2 o más correctas y al menos una incorrecta', async () => {
      const multiple = (flags: boolean[]) => create({ type: 'MULTIPLE', options: options(...flags) }).run();

      await expect(multiple([true, false, false])).rejects.toBeInstanceOf(BadRequestException);
      await expect(multiple([true, true, true])).rejects.toBeInstanceOf(BadRequestException);
      await expect(multiple([true, true, false])).resolves.toBeDefined();
    });

    it('TRUE_FALSE necesita isTrue y crea las opciones Verdadero y Falso', async () => {
      await expect(create({ type: 'TRUE_FALSE' }).run()).rejects.toBeInstanceOf(BadRequestException);

      const { run, repository } = create({ type: 'TRUE_FALSE', isTrue: false });
      await run();

      const [question] = repository.create.mock.calls[0][1] as { type: string; options: { create: unknown[] } }[];

      expect(question.type).toBe('TRUE_FALSE');
      expect(question.options.create).toEqual([
        { text: 'Verdadero', isCorrect: false },
        { text: 'Falso', isCorrect: true },
      ]);
    });

    it('FILL_BLANK necesita respuestas aceptadas y las guarda como correctas, sin repetidas', async () => {
      await expect(create({ type: 'FILL_BLANK' }).run()).rejects.toBeInstanceOf(BadRequestException);

      const { run, repository } = create({
        type: 'FILL_BLANK',
        acceptedAnswers: ['Bogotá', 'bogota', 'Santa Fe'],
      });
      await run();

      const [question] = repository.create.mock.calls[0][1] as { options: { create: unknown[] } }[];

      expect(question.options.create).toEqual([
        { text: 'bogota', isCorrect: true },
        { text: 'Santa Fe', isCorrect: true },
      ]);
    });
  });
});
