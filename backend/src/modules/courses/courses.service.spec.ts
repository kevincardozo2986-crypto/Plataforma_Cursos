import { BadRequestException, ConflictException } from '@nestjs/common';

import { CourseStatus, Role } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import type { CategoriesService } from '../categories/categories.service.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { CourseModulesService } from '../course-modules/course-modules.service.js';
import type { ProgressService } from '../progress/progress.service.js';
import type { CoursesRepository } from './courses.repository.js';
import { CoursesService } from './courses.service.js';

const teacher = { id: 7, role: Role.TEACHER } as AuthenticatedUser;

function build() {
  const repository = {
    create: vi.fn((data: unknown) => Promise.resolve(data)),
    slugExists: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    listManaged: vi.fn(),
  };
  const access = { assertCanManage: vi.fn().mockResolvedValue({}) };
  const categories = { exists: vi.fn().mockResolvedValue(true) };
  const modules = { countByCourse: vi.fn(), outline: vi.fn() };
  const progress = { countEnrollments: vi.fn() };

  const service = new CoursesService(
    repository as unknown as CoursesRepository,
    access as unknown as CourseAccessService,
    categories as unknown as CategoriesService,
    modules as unknown as CourseModulesService,
    progress as unknown as ProgressService,
  );

  return { service, repository, access, categories, modules, progress };
}

describe('CoursesService', () => {
  describe('create', () => {
    it('genera el slug desde el título y asigna al profesor como dueño', async () => {
      const { service, repository } = build();
      repository.slugExists.mockResolvedValue(false);

      await service.create(teacher, {
        title: 'Introducción a Node.js',
        description: 'x',
        price: 10,
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'introduccion-a-node-js',
          teacherId: 7,
        }),
      );
    });

    it('añade un sufijo si el slug ya existe', async () => {
      const { service, repository } = build();
      repository.slugExists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await service.create(teacher, { title: 'Curso', description: 'x', price: 1 });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'curso-3' }),
      );
    });

    it('rechaza una categoría inexistente', async () => {
      const { service, categories } = build();
      categories.exists.mockResolvedValue(false);

      await expect(
        service.create(teacher, {
          title: 'Curso',
          description: 'x',
          price: 1,
          categoryId: 99,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateStatus', () => {
    it('no deja publicar un curso sin módulos', async () => {
      const { service, modules, repository } = build();
      modules.countByCourse.mockResolvedValue(0);

      await expect(
        service.updateStatus(teacher, 1, CourseStatus.PUBLISHED),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('publica un curso que ya tiene módulos', async () => {
      const { service, modules, repository } = build();
      modules.countByCourse.mockResolvedValue(2);

      await service.updateStatus(teacher, 1, CourseStatus.PUBLISHED);

      expect(repository.updateStatus).toHaveBeenCalledWith(
        1,
        CourseStatus.PUBLISHED,
      );
    });

    it('permite archivar sin comprobar módulos', async () => {
      const { service, modules, repository } = build();

      await service.updateStatus(teacher, 1, CourseStatus.ARCHIVED);

      expect(modules.countByCourse).not.toHaveBeenCalled();
      expect(repository.updateStatus).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('no elimina un curso con estudiantes inscritos', async () => {
      const { service, progress, repository } = build();
      progress.countEnrollments.mockResolvedValue(3);

      await expect(service.remove(teacher, 1)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('elimina un curso sin inscritos', async () => {
      const { service, progress, repository } = build();
      progress.countEnrollments.mockResolvedValue(0);

      await expect(service.remove(teacher, 1)).resolves.toEqual({
        deleted: true,
      });
      expect(repository.delete).toHaveBeenCalledWith(1);
    });
  });

  describe('listManaged', () => {
    it('el profesor ve solo sus cursos', async () => {
      const { service, repository } = build();

      await service.listManaged(teacher);

      expect(repository.listManaged).toHaveBeenCalledWith(7);
    });

    it('el administrador ve todos', async () => {
      const { service, repository } = build();

      await service.listManaged({ id: 1, role: Role.ADMIN } as AuthenticatedUser);

      expect(repository.listManaged).toHaveBeenCalledWith(undefined);
    });
  });
});
