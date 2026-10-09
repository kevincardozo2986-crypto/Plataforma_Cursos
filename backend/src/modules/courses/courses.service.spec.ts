import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import {
  CourseStatus,
  CourseVisibility,
  Role,
} from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import type { CategoriesService } from '../categories/categories.service.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { CourseModulesService } from '../course-modules/course-modules.service.js';
import type { ProgressService } from '../progress/progress.service.js';
import type { ReviewsService } from '../reviews/reviews.service.js';
import type { CoursesRepository } from './courses.repository.js';
import { CoursesService, DRAFT_TITLE } from './courses.service.js';

const teacher = { id: 7, role: Role.TEACHER } as AuthenticatedUser;

/** Un curso tal como lo devuelve el repositorio. */
const course = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  title: 'Intro a Node',
  description: 'Aprende Node',
  visibility: CourseVisibility.PUBLIC,
  accessPassword: null,
  requires: [],
  ...overrides,
});

function build() {
  const repository = {
    create: vi.fn((data: unknown) => Promise.resolve(data)),
    slugExists: vi.fn().mockResolvedValue(false),
    slugOwner: vi.fn().mockResolvedValue(null),
    findUntouchedDraft: vi.fn().mockResolvedValue(null),
    listPublished: vi.fn(),
    findPublishedById: vi.fn(),
    countByIds: vi.fn(),
    findById: vi.fn().mockResolvedValue(course()),
    update: vi.fn(
      (_id: number, data: Record<string, unknown>, _prerequisiteIds?: number[]) =>
        Promise.resolve({ ...course(), ...data }),
    ),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    listManaged: vi.fn(),
  };
  const access = { assertCanManage: vi.fn().mockResolvedValue({}) };
  const categories = { exists: vi.fn().mockResolvedValue(true) };
  const modules = { countByCourse: vi.fn().mockResolvedValue(1), outline: vi.fn() };
  const progress = { countEnrollments: vi.fn() };
  const reviews = {
    ratingsOf: vi.fn((ids: number[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, { average: id === 1 ? 4.5 : null, count: id === 1 ? 8 : 0 }]))),
    ),
  };

  const service = new CoursesService(
    repository as unknown as CoursesRepository,
    access as unknown as CourseAccessService,
    categories as unknown as CategoriesService,
    modules as unknown as CourseModulesService,
    progress as unknown as ProgressService,
    reviews as unknown as ReviewsService,
  );

  return { service, repository, access, categories, modules, progress, reviews };
}

describe('CoursesService', () => {
  describe('catálogo público', () => {
    it('cada curso del listado trae su calificación promedio (null si no tiene reseñas)', async () => {
      const { service, repository, reviews } = build();
      repository.listPublished.mockResolvedValue({ data: [{ id: 1, title: 'A' }, { id: 2, title: 'B' }], total: 2 });

      const result = await service.listPublished({});

      expect(reviews.ratingsOf).toHaveBeenCalledWith([1, 2]);
      expect(result.data[0]).toMatchObject({ id: 1, rating: { average: 4.5, count: 8 } });
      expect(result.data[1]).toMatchObject({ id: 2, rating: { average: null, count: 0 } });
    });

    it('el detalle de un curso publicado también trae su calificación', async () => {
      const { service, repository, modules } = build();
      repository.findPublishedById.mockResolvedValue({ id: 1, title: 'A' });
      modules.outline.mockResolvedValue([]);

      await expect(service.findPublished(1)).resolves.toMatchObject({ rating: { average: 4.5, count: 8 } });
    });
  });

  describe('create', () => {
    it('genera el slug desde el título y asigna al profesor como dueño', async () => {
      const { service, repository } = build();

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

  describe('createDraft', () => {
    it('crea un borrador vacío a nombre del profesor', async () => {
      const { service, repository } = build();

      await service.createDraft(teacher);

      expect(repository.create).toHaveBeenCalledWith({
        title: DRAFT_TITLE,
        description: '',
        price: 0,
        slug: 'curso-sin-titulo',
        teacherId: 7,
      });
    });

    it('si ya tiene un borrador sin tocar, lo reutiliza en vez de crear otro', async () => {
      const { service, repository } = build();
      const untouched = course({ id: 42, title: DRAFT_TITLE });
      repository.findUntouchedDraft.mockResolvedValue(untouched);

      const result = await service.createDraft(teacher);

      expect(result).toBe(untouched);
      expect(repository.findUntouchedDraft).toHaveBeenCalledWith(7, DRAFT_TITLE);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('evita repetir la dirección cuando ya hay otro borrador', async () => {
      const { service, repository } = build();
      repository.slugExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await service.createDraft(teacher);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'curso-sin-titulo-2' }),
      );
    });
  });

  describe('update', () => {
    it('no deja usar una dirección que ya tiene otro curso', async () => {
      const { service, repository } = build();
      repository.slugOwner.mockResolvedValue(99);

      await expect(
        service.update(teacher, 1, { slug: 'curso-ajeno' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('permite conservar la propia dirección', async () => {
      const { service, repository } = build();
      repository.slugOwner.mockResolvedValue(1);

      await service.update(teacher, 1, { slug: 'mi-curso' });

      expect(repository.update).toHaveBeenCalled();
    });

    it('guarda la contraseña cifrada y nunca la devuelve', async () => {
      const { service, repository } = build();

      const result = await service.update(teacher, 1, {
        visibility: CourseVisibility.PASSWORD,
        accessPassword: 'secreto123',
      });

      const saved = repository.update.mock.calls[0][1] as { accessPassword: string };

      expect(saved.accessPassword).not.toBe('secreto123');
      expect(await bcrypt.compare('secreto123', saved.accessPassword)).toBe(true);
      expect(result).not.toHaveProperty('accessPassword');
      expect(result.hasPassword).toBe(true);
    });

    it('exige contraseña si el curso pasa a tener contraseña y no hay ninguna', async () => {
      const { service } = build();

      await expect(
        service.update(teacher, 1, { visibility: CourseVisibility.PASSWORD }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('conserva la contraseña existente si no se envía otra', async () => {
      const { service, repository } = build();
      repository.findById.mockResolvedValue(
        course({ visibility: CourseVisibility.PASSWORD, accessPassword: 'hash-previo' }),
      );

      await service.update(teacher, 1, { title: 'Nuevo título' });

      expect(repository.update.mock.calls[0][1]).toHaveProperty('accessPassword', undefined);
    });

    it('borra la contraseña al dejar de ser un curso con contraseña', async () => {
      const { service, repository } = build();
      repository.findById.mockResolvedValue(
        course({ visibility: CourseVisibility.PASSWORD, accessPassword: 'hash-previo' }),
      );

      await service.update(teacher, 1, { visibility: CourseVisibility.PUBLIC });

      expect(repository.update.mock.calls[0][1]).toHaveProperty('accessPassword', null);
    });

    it('un curso no puede ser prerrequisito de sí mismo', async () => {
      const { service } = build();

      await expect(
        service.update(teacher, 1, { prerequisiteIds: [1] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza prerrequisitos que no existen', async () => {
      const { service, repository } = build();
      repository.countByIds.mockResolvedValue(1);

      await expect(
        service.update(teacher, 1, { prerequisiteIds: [2, 3] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reemplaza los prerrequisitos y quita los repetidos', async () => {
      const { service, repository } = build();
      repository.countByIds.mockResolvedValue(2);

      await service.update(teacher, 1, { prerequisiteIds: [2, 3, 2] });

      expect(repository.update.mock.calls[0][2]).toEqual([2, 3]);
    });

    it('no toca los campos obligatorios si llegan nulos, pero sí borra los opcionales', async () => {
      const { service, repository } = build();

      await service.update(teacher, 1, {
        title: null as unknown as string,
        introVideoUrl: null as unknown as string,
      });

      const saved = repository.update.mock.calls[0][1] as Record<string, unknown>;

      expect(saved.title).toBeUndefined();
      expect(saved.introVideoUrl).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('dice exactamente qué falta para publicar un borrador vacío', async () => {
      const { service, repository, modules } = build();
      repository.findById.mockResolvedValue(course({ title: DRAFT_TITLE, description: '  ' }));
      modules.countByCourse.mockResolvedValue(0);

      await expect(
        service.updateStatus(teacher, 1, CourseStatus.PUBLISHED),
      ).rejects.toThrow('Para publicar falta: un título, una descripción, al menos un módulo');
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('avisa solo de lo que falta', async () => {
      const { service, modules } = build();
      modules.countByCourse.mockResolvedValue(0);

      await expect(
        service.updateStatus(teacher, 1, CourseStatus.PUBLISHED),
      ).rejects.toThrow('Para publicar falta: al menos un módulo');
    });

    it('publica un curso completo', async () => {
      const { service, repository } = build();

      await service.updateStatus(teacher, 1, CourseStatus.PUBLISHED);

      expect(repository.updateStatus).toHaveBeenCalledWith(1, CourseStatus.PUBLISHED);
    });

    it('permite archivar sin comprobar nada', async () => {
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
