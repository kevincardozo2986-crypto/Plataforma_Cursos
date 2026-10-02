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
