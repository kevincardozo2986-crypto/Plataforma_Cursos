import { ConflictException, ForbiddenException } from '@nestjs/common';

import {
  CourseStatus,
  EnrollmentStatus,
  Role,
} from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { LessonsService } from '../lessons/lessons.service.js';
import type { ProgressRepository } from './progress.repository.js';
import { ProgressService } from './progress.service.js';

const student = { id: 5, role: Role.STUDENT } as AuthenticatedUser;

function build() {
  const repository = {
    findEnrollment: vi.fn(),
    createEnrollment: vi.fn().mockResolvedValue({ id: 1 }),
    updateEnrollment: vi.fn().mockResolvedValue({}),
    markLessonDone: vi.fn().mockResolvedValue({}),
    unmarkLesson: vi.fn().mockResolvedValue({}),
    completedLessonIds: vi.fn(),
  };
  const access = {
    getCourseOrThrow: vi.fn(),
    courseIdOfLesson: vi.fn().mockResolvedValue(10),
  };
  const lessons = { idsByCourse: vi.fn() };

  const service = new ProgressService(
    repository as unknown as ProgressRepository,
    access as unknown as CourseAccessService,
    lessons as unknown as LessonsService,
  );

  return { service, repository, access, lessons };
}

describe('ProgressService', () => {
  describe('enroll', () => {
    it('inscribe al estudiante en un curso publicado', async () => {
      const { service, repository, access } = build();
      access.getCourseOrThrow.mockResolvedValue({ status: CourseStatus.PUBLISHED });
      repository.findEnrollment.mockResolvedValue(null);

      await service.enroll(student, 10);

      expect(repository.createEnrollment).toHaveBeenCalledWith(5, 10);
    });

    it('no permite inscribirse a un borrador', async () => {
      const { service, access } = build();
      access.getCourseOrThrow.mockResolvedValue({ status: CourseStatus.DRAFT });

      await expect(service.enroll(student, 10)).rejects.toThrow('no existe');
    });

    it('rechaza una inscripción duplicada', async () => {
      const { service, repository, access } = build();
      access.getCourseOrThrow.mockResolvedValue({ status: CourseStatus.PUBLISHED });
      repository.findEnrollment.mockResolvedValue({
        id: 1,
        status: EnrollmentStatus.ACTIVE,
      });

      await expect(service.enroll(student, 10)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('reactiva una inscripción cancelada en vez de crear otra', async () => {
      const { service, repository, access } = build();
      access.getCourseOrThrow.mockResolvedValue({ status: CourseStatus.PUBLISHED });
      repository.findEnrollment.mockResolvedValue({
        id: 4,
        status: EnrollmentStatus.CANCELLED,
      });

      await service.enroll(student, 10);

      expect(repository.createEnrollment).not.toHaveBeenCalled();
      expect(repository.updateEnrollment).toHaveBeenCalledWith(4, {
        status: EnrollmentStatus.ACTIVE,
        completedAt: null,
      });
    });
  });

  describe('completeLesson', () => {
    it('exige estar inscrito', async () => {
      const { service, repository } = build();
      repository.findEnrollment.mockResolvedValue(null);

      await expect(service.completeLesson(student, 3)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.markLessonDone).not.toHaveBeenCalled();
    });

    it('calcula el porcentaje sin completar el curso a medias', async () => {
      const { service, repository, lessons } = build();
      repository.findEnrollment.mockResolvedValue({
        id: 1,
        status: EnrollmentStatus.ACTIVE,
      });
      lessons.idsByCourse.mockResolvedValue([1, 2, 3, 4]);
      repository.completedLessonIds.mockResolvedValue([1]);

      const progress = await service.completeLesson(student, 1);

      expect(progress.percent).toBe(25);
      expect(repository.updateEnrollment).not.toHaveBeenCalled();
    });

    it('marca la inscripción como COMPLETED al terminar todas las lecciones', async () => {
      const { service, repository, lessons } = build();
      repository.findEnrollment.mockResolvedValue({
        id: 1,
        status: EnrollmentStatus.ACTIVE,
      });
      lessons.idsByCourse.mockResolvedValue([1, 2]);
      repository.completedLessonIds.mockResolvedValue([1, 2]);

      const progress = await service.completeLesson(student, 2);

      expect(progress.percent).toBe(100);
      expect(repository.updateEnrollment).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: EnrollmentStatus.COMPLETED }),
      );
    });

    it('un curso sin lecciones no se marca como completado', async () => {
      const { service, repository, lessons } = build();
      repository.findEnrollment.mockResolvedValue({
        id: 1,
        status: EnrollmentStatus.ACTIVE,
      });
      lessons.idsByCourse.mockResolvedValue([]);
      repository.completedLessonIds.mockResolvedValue([]);

      const progress = await service.completeLesson(student, 1);

      expect(progress.percent).toBe(0);
      expect(repository.updateEnrollment).not.toHaveBeenCalled();
    });
  });

  describe('uncompleteLesson', () => {
    it('devuelve la inscripción a ACTIVE si estaba completada', async () => {
      const { service, repository, lessons } = build();
      repository.findEnrollment.mockResolvedValue({
        id: 1,
        status: EnrollmentStatus.COMPLETED,
      });
      lessons.idsByCourse.mockResolvedValue([1, 2]);
      repository.completedLessonIds.mockResolvedValue([1]);

      const progress = await service.uncompleteLesson(student, 2);

      expect(progress.percent).toBe(50);
      expect(repository.updateEnrollment).toHaveBeenCalledWith(1, {
        status: EnrollmentStatus.ACTIVE,
        completedAt: null,
      });
    });
  });

  describe('isEnrolled', () => {
    it.each([
      [EnrollmentStatus.ACTIVE, true],
      [EnrollmentStatus.COMPLETED, true],
      [EnrollmentStatus.CANCELLED, false],
    ])('con estado %s devuelve %s', async (status, expected) => {
      const { service, repository } = build();
      repository.findEnrollment.mockResolvedValue({ id: 1, status });

      await expect(service.isEnrolled(5, 10)).resolves.toBe(expected);
    });

    it('devuelve false si nunca se inscribió', async () => {
      const { service, repository } = build();
      repository.findEnrollment.mockResolvedValue(null);

      await expect(service.isEnrolled(5, 10)).resolves.toBe(false);
    });
  });
});
