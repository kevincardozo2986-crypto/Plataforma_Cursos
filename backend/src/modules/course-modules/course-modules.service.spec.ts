import { BadRequestException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { CourseModulesRepository } from './course-modules.repository.js';
import { CourseModulesService } from './course-modules.service.js';

const teacher = { id: 7, role: Role.TEACHER } as AuthenticatedUser;

function build() {
  const repository = {
    maxPosition: vi.fn().mockResolvedValue(2),
    // Módulos 1, 2 y 3 del curso; 3 ya pide a 2 y 2 pide a 1.
    idsByCourse: vi.fn().mockResolvedValue([1, 2, 3]),
    prerequisiteGraph: vi.fn().mockResolvedValue(new Map([[3, [2]], [2, [1]]])),
    create: vi.fn((data: object) => Promise.resolve({ id: 4, ...data })),
    update: vi.fn((id: number, data: object) => Promise.resolve({ id, ...data })),
  };
  const access = {
    assertCanManage: vi.fn().mockResolvedValue({}),
    courseIdOfModule: vi.fn().mockResolvedValue(10),
  };
  const service = new CourseModulesService(
    repository as unknown as CourseModulesRepository,
    access as unknown as CourseAccessService,
  );

  return { service, repository, access };
}

describe('CourseModulesService: liberación gradual', () => {
  describe('create', () => {
    it('guarda la fecha, los días y los prerrequisitos del módulo', async () => {
      const { service, repository } = build();

      await service.create(teacher, 10, {
        title: 'Módulo nuevo',
        unlockAt: '2026-11-01T12:00:00.000Z',
        unlockAfterDays: 7,
        requiresModuleIds: [1, 2],
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: 10,
          position: 3,
          unlockAt: new Date('2026-11-01T12:00:00.000Z'),
          unlockAfterDays: 7,
        }),
        [1, 2],
      );
    });

    it('sin ajustes no pide nada especial', async () => {
      const { service, repository } = build();

      await service.create(teacher, 10, { title: 'Módulo simple' });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ unlockAt: undefined, unlockAfterDays: undefined }),
        undefined,
      );
    });

    it('rechaza prerrequisitos que son de otro curso', async () => {
      const { service, repository } = build();

      await expect(
        service.create(teacher, 10, { title: 'Módulo', requiresModuleIds: [1, 99] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('reemplaza los prerrequisitos y quita los repetidos', async () => {
      const { service, repository } = build();

      await service.update(teacher, 3, { requiresModuleIds: [1, 1, 2, 2] });

      expect(repository.update).toHaveBeenCalledWith(3, expect.any(Object), [1, 2]);
    });

    it('un módulo no puede pedirse a sí mismo', async () => {
      const { service } = build();

      await expect(service.update(teacher, 1, { requiresModuleIds: [1] })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza los círculos: 1 pide 3, pero 3 ya pide 2 y 2 pide 1', async () => {
      const { service, repository } = build();

      await expect(service.update(teacher, 1, { requiresModuleIds: [3] })).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('una dependencia válida se acepta', async () => {
      const { service } = build();

      await expect(service.update(teacher, 3, { requiresModuleIds: [1, 2] })).resolves.toBeDefined();
    });

    it('[] vacía los prerrequisitos; sin enviarlos, no se tocan', async () => {
      const { service, repository } = build();

      await service.update(teacher, 2, { requiresModuleIds: [] });
      await service.update(teacher, 2, { title: 'Nuevo nombre' });

      expect(repository.update).toHaveBeenNthCalledWith(1, 2, expect.any(Object), []);
      expect(repository.update).toHaveBeenNthCalledWith(2, 2, expect.any(Object), undefined);
    });

    it('null quita la fecha o los días; sin enviarlos no se tocan', async () => {
      const { service, repository } = build();

      await service.update(teacher, 2, { unlockAt: null, unlockAfterDays: null });
      await service.update(teacher, 2, { title: 'Otro' });

      expect(repository.update).toHaveBeenNthCalledWith(1, 2, expect.objectContaining({ unlockAt: null, unlockAfterDays: null }), undefined);
      expect(repository.update).toHaveBeenNthCalledWith(2, 2, expect.objectContaining({ unlockAt: undefined, unlockAfterDays: undefined }), undefined);
    });
  });
});
