import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { Role } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { ProgressService } from '../progress/progress.service.js';
import type { EvaluationsRepository } from './evaluations.repository.js';
import { EvaluationsService } from './evaluations.service.js';

const student = { id: 5, role: Role.STUDENT } as AuthenticatedUser;

const evaluation = {
  id: 1,
  passingScore: 60,
  questions: [
    {
      id: 11,
      points: 1,
      options: [
        { id: 111, isCorrect: true },
        { id: 112, isCorrect: false },
      ],
    },
    {
      id: 12,
      points: 1,
      options: [
        { id: 121, isCorrect: false },
        { id: 122, isCorrect: true },
      ],
    },
  ],
};

function build() {
  const repository = {
    findWithAnswers: vi.fn().mockResolvedValue(evaluation),
    createAttempt: vi.fn((data: unknown) => Promise.resolve({ id: 1, ...(data as object) })),
  };
  const access = {
    courseIdOfEvaluation: vi.fn().mockResolvedValue(10),
    courseIdOfModule: vi.fn().mockResolvedValue(10),
    assertCanView: vi.fn().mockResolvedValue({}),
    assertCanManage: vi.fn().mockResolvedValue({}),
  };
  const progress = { isEnrolled: vi.fn().mockResolvedValue(true) };

  const service = new EvaluationsService(
    repository as unknown as EvaluationsRepository,
    access as unknown as CourseAccessService,
    progress as unknown as ProgressService,
  );

  return { service, repository, access, progress };
}

describe('EvaluationsService', () => {
  describe('submitAttempt', () => {
    it('exige estar inscrito en el curso', async () => {
      const { service, progress } = build();
      progress.isEnrolled.mockResolvedValue(false);

      await expect(
        service.submitAttempt(student, 1, {
          answers: [{ questionId: 11, optionId: 111 }],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('califica y aprueba con todas las respuestas correctas', async () => {
      const { service, repository } = build();

      const result = await service.submitAttempt(student, 1, {
        answers: [
          { questionId: 11, optionId: 111 },
          { questionId: 12, optionId: 122 },
        ],
      });

      expect(result).toMatchObject({ score: 100, passed: true, totalPoints: 2 });
      expect(repository.createAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 5, evaluationId: 1, score: 100 }),
      );
    });

    it('reprueba si la nota queda bajo el mínimo', async () => {
      const { service } = build();

      const result = await service.submitAttempt(student, 1, {
        answers: [
          { questionId: 11, optionId: 111 },
          { questionId: 12, optionId: 121 },
        ],
      });

      expect(result).toMatchObject({ score: 50, passed: false });
    });

    it('rechaza una pregunta que no es de la evaluación', async () => {
      const { service, repository } = build();

      await expect(
        service.submitAttempt(student, 1, {
          answers: [{ questionId: 999, optionId: 111 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('rechaza una opción que pertenece a otra pregunta', async () => {
      const { service } = build();

      await expect(
        service.submitAttempt(student, 1, {
          answers: [{ questionId: 11, optionId: 122 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza responder la misma pregunta dos veces', async () => {
      const { service } = build();

      await expect(
        service.submitAttempt(student, 1, {
          answers: [
            { questionId: 11, optionId: 111 },
            { questionId: 11, optionId: 112 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('create', () => {
    const dto = (correctCount: number) => ({
      title: 'Quiz',
      questions: [
        {
          text: 'Pregunta uno',
          options: [
            { text: 'a', isCorrect: correctCount >= 1 },
            { text: 'b', isCorrect: correctCount >= 2 },
          ],
        },
      ],
    });

    it('exige exactamente una opción correcta por pregunta', async () => {
      const { service } = build();
      const teacher = { id: 7, role: Role.TEACHER } as AuthenticatedUser;

      await expect(service.create(teacher, 1, dto(0))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.create(teacher, 1, dto(2))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
