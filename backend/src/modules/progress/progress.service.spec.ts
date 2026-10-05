import { ConflictException, ForbiddenException } from '@nestjs/common';

import * as bcrypt from 'bcrypt';

import {
  CourseStatus,
  CourseVisibility,
  EnrollmentStatus,
  Role,
} from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { LessonsService } from '../lessons/lessons.service.js';
import type { ProgressRepository } from './progress.repository.js';
import { ProgressService } from './progress.service.js';

const student = { id: 5, role: Role.STUDENT } as AuthenticatedUser;

/** Reglas de inscripción de un curso abierto a todos; cada prueba cambia lo que necesita. */
const rules = (overrides: Record<string, unknown> = {}) => ({
  status: CourseStatus.PUBLISHED,
  visibility: CourseVisibility.PUBLIC,
  accessPasswordHash: null as string | null,
  maxStudents: null as number | null,
  prerequisites: [] as { id: number; title: string }[],
  ...overrides,
});

function build() {
  const repository = {
    findEnrollment: vi.fn(),
    createEnrollment: vi.fn().mockResolvedValue({ id: 1 }),
    updateEnrollment: vi.fn().mockResolvedValue({}),
    markLessonDone: vi.fn().mockResolvedValue({}),
    unmarkLesson: vi.fn().mockResolvedValue({}),
    completedLessonIds: vi.fn(),
    countActiveEnrollments: vi.fn().mockResolvedValue(0),
    completedCourseIds: vi.fn().mockResolvedValue([]),
  };
  const access = {
    getEnrollmentRules: vi.fn(),
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
      access.getEnrollmentRules.mockResolvedValue(rules());
      repository.findEnrollment.mockResolvedValue(null);

      await service.enroll(student, 10);

      expect(repository.createEnrollment).toHaveBeenCalledWith(5, 10);
    });

    it('no permite inscribirse a un borrador', async () => {
      const { service, access } = build();
      access.getEnrollmentRules.mockResolvedValue(rules({ status: CourseStatus.DRAFT }));

      await expect(service.enroll(student, 10)).rejects.toThrow('no existe');
    });

    it('rechaza una inscripción duplicada', async () => {
      const { service, repository, access } = build();
      access.getEnrollmentRules.mockResolvedValue(rules());
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
      access.getEnrollmentRules.mockResolvedValue(rules());
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

  describe('enroll: reglas de acceso del curso', () => {
    const setup = (courseRules: Record<string, unknown>) => {
      const ctx = build();
      ctx.access.getEnrollmentRules.mockResolvedValue(rules(courseRules));
      ctx.repository.findEnrollment.mockResolvedValue(null);

      return ctx;
    };

    it('un curso privado no admite inscripciones', async () => {
      const { service, repository } = setup({ visibility: CourseVisibility.PRIVATE });

      await expect(service.enroll(student, 10)).rejects.toThrow('privado');
      expect(repository.createEnrollment).not.toHaveBeenCalled();
    });

    describe('con contraseña', () => {
      it('exige la contraseña', async () => {
        const hash = await bcrypt.hash('secreto', 4);
        const { service } = setup({
          visibility: CourseVisibility.PASSWORD,
          accessPasswordHash: hash,
        });

        await expect(service.enroll(student, 10)).rejects.toThrow('requiere una contraseña');
      });

      it('rechaza una contraseña incorrecta', async () => {
        const hash = await bcrypt.hash('secreto', 4);
        const { service, repository } = setup({
          visibility: CourseVisibility.PASSWORD,
          accessPasswordHash: hash,
        });

        await expect(service.enroll(student, 10, 'otra')).rejects.toThrow('incorrecta');
        expect(repository.createEnrollment).not.toHaveBeenCalled();
      });

      it('inscribe con la contraseña correcta', async () => {
        const hash = await bcrypt.hash('secreto', 4);
        const { service, repository } = setup({
          visibility: CourseVisibility.PASSWORD,
          accessPasswordHash: hash,
        });

        await service.enroll(student, 10, 'secreto');

        expect(repository.createEnrollment).toHaveBeenCalledWith(5, 10);
      });

      it('un curso con contraseña sin hash guardado no deja entrar a nadie', async () => {
        const { service } = setup({ visibility: CourseVisibility.PASSWORD });

        await expect(service.enroll(student, 10, 'cualquiera')).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      });
    });

    describe('prerrequisitos', () => {
      const prerequisites = [
        { id: 2, title: 'Fundamentos' },
        { id: 3, title: 'Álgebra' },
      ];

      it('pide completar los que faltan, por nombre', async () => {
        const { service, repository } = setup({ prerequisites });
        repository.completedCourseIds.mockResolvedValue([2]);

        await expect(service.enroll(student, 10)).rejects.toThrow('Antes debes completar: Álgebra');
      });

      it('deja inscribirse cuando están todos completados', async () => {
        const { service, repository } = setup({ prerequisites });
        repository.completedCourseIds.mockResolvedValue([2, 3]);

        await service.enroll(student, 10);

        expect(repository.createEnrollment).toHaveBeenCalled();
      });
    });

    describe('cupo máximo', () => {
      it('rechaza cuando el cupo está lleno', async () => {
        const { service, repository } = setup({ maxStudents: 2 });
        repository.countActiveEnrollments.mockResolvedValue(2);

        await expect(service.enroll(student, 10)).rejects.toBeInstanceOf(ConflictException);
        expect(repository.createEnrollment).not.toHaveBeenCalled();
      });

      it('deja inscribirse si queda un lugar', async () => {
        const { service, repository } = setup({ maxStudents: 2 });
        repository.countActiveEnrollments.mockResolvedValue(1);

        await service.enroll(student, 10);

        expect(repository.createEnrollment).toHaveBeenCalled();
      });

      it('sin cupo definido no se cuenta a nadie', async () => {
        const { service, repository } = setup({ maxStudents: null });

        await service.enroll(student, 10);

        expect(repository.countActiveEnrollments).not.toHaveBeenCalled();
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
