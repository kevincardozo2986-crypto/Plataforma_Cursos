import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { CourseStatus, Role } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import type { CourseAccessRepository } from './course-access.repository.js';
import { CourseAccessService } from './course-access.service.js';

const user = (id: number, role: Role) => ({ id, role }) as AuthenticatedUser;

describe('CourseAccessService', () => {
  const findCourseBasics = vi.fn();
  const courseIdOfModule = vi.fn();
  const service = new CourseAccessService({
    findCourseBasics,
    courseIdOfModule,
  } as unknown as CourseAccessRepository);

  const course = (status: CourseStatus) => ({ id: 1, teacherId: 7, status });

  beforeEach(() => vi.resetAllMocks());

  describe('assertCanManage', () => {
    it('permite al profesor dueño', async () => {
      findCourseBasics.mockResolvedValue(course(CourseStatus.DRAFT));

      await expect(
        service.assertCanManage(user(7, Role.TEACHER), 1),
      ).resolves.toBeDefined();
    });

    it('permite al administrador aunque no sea el dueño', async () => {
      findCourseBasics.mockResolvedValue(course(CourseStatus.DRAFT));

      await expect(
        service.assertCanManage(user(1, Role.ADMIN), 1),
      ).resolves.toBeDefined();
    });

    it('rechaza a otro profesor', async () => {
      findCourseBasics.mockResolvedValue(course(CourseStatus.DRAFT));

      await expect(
        service.assertCanManage(user(8, Role.TEACHER), 1),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rechaza a un estudiante, aunque su id coincida con el del dueño', async () => {
      findCourseBasics.mockResolvedValue(course(CourseStatus.PUBLISHED));

      await expect(
        service.assertCanManage(user(7, Role.STUDENT), 1),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lanza 404 si el curso no existe', async () => {
      findCourseBasics.mockResolvedValue(null);

      await expect(
        service.assertCanManage(user(7, Role.TEACHER), 99),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assertCanView', () => {
    it('muestra un curso publicado a cualquiera', async () => {
      findCourseBasics.mockResolvedValue(course(CourseStatus.PUBLISHED));

      await expect(
        service.assertCanView(user(50, Role.STUDENT), 1),
      ).resolves.toBeDefined();
    });

    it('oculta un borrador a un estudiante como si no existiera', async () => {
      findCourseBasics.mockResolvedValue(course(CourseStatus.DRAFT));

      await expect(
        service.assertCanView(user(50, Role.STUDENT), 1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('muestra el borrador a su profesor', async () => {
      findCourseBasics.mockResolvedValue(course(CourseStatus.DRAFT));

      await expect(
        service.assertCanView(user(7, Role.TEACHER), 1),
      ).resolves.toBeDefined();
    });
  });

  it('lanza 404 si el módulo no existe al resolver su curso', async () => {
    courseIdOfModule.mockResolvedValue(null);

    await expect(service.courseIdOfModule(5)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('CourseAccessService: instructores', () => {
  const teacherOwner = user(7, Role.TEACHER);
  const coInstructor = user(8, Role.TEACHER);
  const otherTeacher = user(99, Role.TEACHER);

  function build() {
    const repository = {
      findCourseBasics: vi.fn().mockResolvedValue({
        id: 3, title: 'Angular', teacherId: 7, status: CourseStatus.PUBLISHED, instructors: [{ userId: 8 }],
      }),
    };

    return new CourseAccessService(repository as unknown as CourseAccessRepository);
  }

  it('el autor y los instructores gestionan el curso; otro docente no', async () => {
    const service = build();

    await expect(service.assertCanManage(teacherOwner, 3)).resolves.toBeDefined();
    await expect(service.assertCanManage(coInstructor, 3)).resolves.toBeDefined();
    await expect(service.assertCanManage(otherTeacher, 3)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un estudiante no gestiona el curso aunque su id coincida con el de un instructor', async () => {
    await expect(build().assertCanManage(user(8, Role.STUDENT), 3)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el curso trae la lista de ids de sus instructores', async () => {
    expect((await build().getCourseOrThrow(3)).instructorIds).toEqual([8]);
  });

  it('un curso en borrador lo ve su instructor, no un estudiante', async () => {
    const draft = new CourseAccessService({
      findCourseBasics: vi.fn().mockResolvedValue({ id: 3, teacherId: 7, status: CourseStatus.DRAFT, instructors: [{ userId: 8 }] }),
    } as unknown as CourseAccessRepository);

    await expect(draft.assertCanView(coInstructor, 3)).resolves.toBeDefined();
    await expect(draft.assertCanView(user(5, Role.STUDENT), 3)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('assertIsOwner (lo delicado es solo del autor)', () => {
    it('lo permite al autor y a un admin', async () => {
      const service = build();

      await expect(service.assertIsOwner(teacherOwner, 3)).resolves.toBeDefined();
      await expect(service.assertIsOwner(user(1, Role.ADMIN), 3)).resolves.toBeDefined();
    });

    it('un instructor NO es el autor', async () => {
      await expect(build().assertIsOwner(coInstructor, 3)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un estudiante tampoco', async () => {
      await expect(build().assertIsOwner(user(7, Role.STUDENT), 3)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

describe('CourseAccessService: acceso al contenido y liberación gradual', () => {
  const teacher = user(7, Role.TEACHER);
  const admin = user(1, Role.ADMIN);
  const student = user(5, Role.STUDENT);
  const day = 24 * 60 * 60 * 1000;

  const modules = [
    { id: 1, title: 'Introducción', position: 1, unlockAt: null, unlockAfterDays: null, requires: [] as number[] },
    { id: 2, title: 'Avanzado', position: 2, unlockAt: null, unlockAfterDays: null, requires: [1] },
  ];

  function build(courseOverrides: Record<string, unknown> = {}) {
    const repository = {
      findCourseBasics: vi.fn().mockResolvedValue({
        id: 3, title: 'Angular', teacherId: 7, status: CourseStatus.PUBLISHED, visibility: 'PUBLIC',
        qaEnabled: true, publicContent: false, dripType: 'NONE', ...courseOverrides,
      }),
      moduleIdOfLesson: vi.fn().mockResolvedValue(2),
      moduleIdOfEvaluation: vi.fn().mockResolvedValue(2),
      moduleIdOfAssignment: vi.fn().mockResolvedValue(2),
      courseIdOfModule: vi.fn().mockResolvedValue(3),
      findEnrollmentBasics: vi.fn().mockResolvedValue({ id: 50, status: 'ACTIVE', enrolledAt: new Date(Date.now() - 2 * day) }),
      findDripModules: vi.fn().mockResolvedValue(modules),
      completedModuleIds: vi.fn().mockResolvedValue([]),
    };

    return { service: new CourseAccessService(repository as unknown as CourseAccessRepository), repository };
  }

  describe('assertContentAccess', () => {
    it('el docente del curso y el admin entran siempre, aunque el módulo esté cerrado', async () => {
      const { service, repository } = build({ dripType: 'SEQUENTIAL' });

      await expect(service.assertContentAccess(teacher, { lessonId: 9 })).resolves.toBeUndefined();
      await expect(service.assertContentAccess(admin, { lessonId: 9 })).resolves.toBeUndefined();
      expect(repository.findEnrollmentBasics).not.toHaveBeenCalled();
    });

    it('otro docente no gestiona este curso: se le trata como a cualquiera sin inscripción', async () => {
      const { service, repository } = build();
      repository.findEnrollmentBasics.mockResolvedValue(null);

      await expect(service.assertContentAccess(user(99, Role.TEACHER), { lessonId: 9 })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un estudiante inscrito entra a un curso sin liberación gradual', async () => {
      const { service } = build();

      await expect(service.assertContentAccess(student, { lessonId: 9 })).resolves.toBeUndefined();
    });

    it('sin inscripción se rechaza (403) y se explica el motivo', async () => {
      const { service, repository } = build();
      repository.findEnrollmentBasics.mockResolvedValue(null);

      const error = await service.assertContentAccess(student, { lessonId: 9 }).catch((e) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toMatchObject({ locked: { reason: 'NOT_ENROLLED' } });
    });

    it('una inscripción cancelada cuenta como no inscrito', async () => {
      const { service, repository } = build();
      repository.findEnrollmentBasics.mockResolvedValue({ id: 50, status: 'CANCELLED', enrolledAt: new Date() });

      await expect(service.assertContentAccess(student, { lessonId: 9 })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('sin inscripción, el contenido público se ve si el curso no tiene liberación gradual', async () => {
      const { service, repository } = build({ publicContent: true });
      repository.findEnrollmentBasics.mockResolvedValue(null);

      await expect(service.assertContentAccess(student, { lessonId: 9 })).resolves.toBeUndefined();
    });

    it('pero con liberación gradual "contenido público" ya no abre nada sin inscripción', async () => {
      const { service, repository } = build({ publicContent: true, dripType: 'BY_DATE' });
      repository.findEnrollmentBasics.mockResolvedValue(null);

      await expect(service.assertContentAccess(student, { lessonId: 9 })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un curso en borrador "no existe" para un estudiante', async () => {
      const { service } = build({ status: CourseStatus.DRAFT });

      await expect(service.assertContentAccess(student, { lessonId: 9 })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('SEQUENTIAL: el módulo 2 sigue cerrado hasta terminar el 1, y se explica cuál falta', async () => {
      const { service } = build({ dripType: 'SEQUENTIAL' });

      const error = await service.assertContentAccess(student, { lessonId: 9 }).catch((e) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.getResponse()).toMatchObject({
        message: 'Termina el módulo anterior («Introducción») para desbloquear este contenido',
        locked: { reason: 'PREVIOUS', requiredModules: [{ id: 1, title: 'Introducción' }] },
      });
    });

    it('SEQUENTIAL: al terminar el módulo 1 se abre el 2', async () => {
      const { service, repository } = build({ dripType: 'SEQUENTIAL' });
      repository.completedModuleIds.mockResolvedValue([1]);

      await expect(service.assertContentAccess(student, { lessonId: 9 })).resolves.toBeUndefined();
    });

    it('AFTER_DAYS: cuenta desde la inscripción de CADA alumno', async () => {
      const { service, repository } = build({ dripType: 'AFTER_DAYS' });
      repository.findDripModules.mockResolvedValue([{ ...modules[1], unlockAfterDays: 7 }]);

      // Inscrito hace 2 días y el módulo se abre a los 7: cerrado.
      await expect(service.assertContentAccess(student, { lessonId: 9 })).rejects.toBeInstanceOf(ForbiddenException);

      // Inscrito hace 10 días: abierto.
      repository.findEnrollmentBasics.mockResolvedValue({ id: 50, status: 'ACTIVE', enrolledAt: new Date(Date.now() - 10 * day) });
      await expect(service.assertContentAccess(student, { lessonId: 9 })).resolves.toBeUndefined();
    });

    it('BY_DATE: cerrado hasta la fecha, y el error trae cuándo se abre', async () => {
      const { service, repository } = build({ dripType: 'BY_DATE' });
      const unlockAt = new Date(Date.now() + 5 * day);
      repository.findDripModules.mockResolvedValue([{ ...modules[1], unlockAt }]);

      const error = await service.assertContentAccess(student, { lessonId: 9 }).catch((e) => e);

      expect(error.getResponse()).toMatchObject({ locked: { reason: 'DATE', unlocksAt: unlockAt } });
    });

    it('funciona igual desde un módulo, una evaluación o una tarea', async () => {
      const { service, repository } = build({ dripType: 'SEQUENTIAL' });

      for (const ref of [{ moduleId: 2 }, { evaluationId: 4 }, { assignmentId: 6 }]) {
        await expect(service.assertContentAccess(student, ref)).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(repository.moduleIdOfEvaluation).toHaveBeenCalledWith(4);
      expect(repository.moduleIdOfAssignment).toHaveBeenCalledWith(6);
    });

    it('un contenido que no existe responde 404', async () => {
      const { service, repository } = build();
      repository.moduleIdOfLesson.mockResolvedValue(null);

      await expect(service.assertContentAccess(student, { lessonId: 99 })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('moduleAvailability', () => {
    it('el docente lo ve todo abierto', async () => {
      const { service } = build({ dripType: 'SEQUENTIAL' });

      const result = await service.moduleAvailability(teacher, 3);

      expect(result.dripType).toBe('SEQUENTIAL');
      expect(result.modules.every((m) => !m.locked)).toBe(true);
    });

    it('un estudiante ve cuáles están cerradas y por qué', async () => {
      const { service } = build({ dripType: 'PREREQUISITES' });

      const result = await service.moduleAvailability(student, 3);

      expect(result.modules).toMatchObject([
        { moduleId: 1, locked: false },
        { moduleId: 2, locked: true, reason: 'PREREQUISITES', requiredModules: [{ id: 1, title: 'Introducción' }] },
      ]);
    });

    it('sin inscripción todo figura como "no inscrito", salvo contenido público sin liberación', async () => {
      const closed = build();
      closed.repository.findEnrollmentBasics.mockResolvedValue(null);
      const open = build({ publicContent: true });
      open.repository.findEnrollmentBasics.mockResolvedValue(null);

      expect((await closed.service.moduleAvailability(student, 3)).modules.every((m) => m.locked && m.reason === 'NOT_ENROLLED')).toBe(true);
      expect((await open.service.moduleAvailability(student, 3)).modules.every((m) => !m.locked)).toBe(true);
    });
  });
});
