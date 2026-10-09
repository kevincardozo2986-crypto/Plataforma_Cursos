import { ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { ProgressService } from '../progress/progress.service.js';
import type { ReviewsRepository } from './reviews.repository.js';
import { ReviewsService } from './reviews.service.js';

const student = { id: 5, role: Role.STUDENT } as AuthenticatedUser;
const teacher = { id: 7, role: Role.TEACHER } as AuthenticatedUser;
const admin = { id: 1, role: Role.ADMIN } as AuthenticatedUser;

const published = { id: 3, title: 'Angular', teacherId: 7, status: 'PUBLISHED', visibility: 'PUBLIC' };

function build() {
  const repository = {
    findMine: vi.fn().mockResolvedValue(null),
    save: vi.fn((_c: number, _u: number, data: object) => Promise.resolve({ id: 11, courseId: 3, ...data })),
    deleteMine: vi.fn().mockResolvedValue(1),
    findByCourse: vi.fn().mockResolvedValue({
      items: [{ id: 1, rating: 5, comment: 'Genial', user: { firstName: 'Ana', lastName: 'Ruiz Pérez' } }],
      total: 1,
    }),
    ratingCounts: vi.fn().mockResolvedValue([{ rating: 5, count: 3 }, { rating: 4, count: 1 }]),
    averagesOf: vi.fn().mockResolvedValue([]),
    findForTeacher: vi.fn().mockResolvedValue({
      items: [{ id: 1, rating: 4, user: { id: 5, firstName: 'Ana', lastName: 'Ruiz' }, course: { id: 3, title: 'Angular' } }],
      total: 1,
    }),
  };
  const access = {
    getCourseOrThrow: vi.fn().mockResolvedValue(published),
    assertCanView: vi.fn().mockResolvedValue(published),
    assertCanManage: vi.fn().mockResolvedValue(published),
  };
  const progress = { isEnrolled: vi.fn().mockResolvedValue(true) };
  const notifications = { notify: vi.fn().mockResolvedValue(1) };

  const service = new ReviewsService(
    repository as unknown as ReviewsRepository,
    access as unknown as CourseAccessService,
    progress as unknown as ProgressService,
    notifications as unknown as NotificationsService,
  );

  return { service, repository, access, progress, notifications };
}

describe('ReviewsService', () => {
  describe('saveMine', () => {
    it('un estudiante inscrito deja su reseña y se avisa al docente', async () => {
      const { service, repository, notifications } = build();

      await service.saveMine(student, 3, { rating: 5, comment: 'Excelente curso' });

      expect(repository.save).toHaveBeenCalledWith(3, 5, { rating: 5, comment: 'Excelente curso' });
      expect(notifications.notify).toHaveBeenCalledWith(
        [7],
        { type: 'NEW_REVIEW', title: 'Nueva reseña: 5 de 5', message: 'En «Angular»: Excelente curso', courseId: 3, refId: 11 },
        5,
      );
    });

    it('la reseña nueva le llega al autor del curso y a sus instructores', async () => {
      const { service, access, notifications } = build();
      access.assertCanView.mockResolvedValue({ ...published, instructorIds: [8, 9] });

      await service.saveMine(student, 3, { rating: 4 });

      expect(notifications.notify).toHaveBeenCalledWith([7, 8, 9], expect.anything(), 5);
    });

    it('el comentario es opcional', async () => {
      const { service, repository } = build();

      await service.saveMine(student, 3, { rating: 4 });

      expect(repository.save).toHaveBeenCalledWith(3, 5, { rating: 4, comment: null });
    });

    it('editar una reseña existente NO vuelve a avisar al docente', async () => {
      const { service, repository, notifications } = build();
      repository.findMine.mockResolvedValue({ id: 11 });

      await service.saveMine(student, 3, { rating: 3 });

      expect(repository.save).toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('quien no está inscrito no puede reseñar', async () => {
      const { service, progress, repository } = build();
      progress.isEnrolled.mockResolvedValue(false);

      await expect(service.saveMine(student, 3, { rating: 5 })).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('mine y removeMine', () => {
    it('sin reseña responden 404', async () => {
      const { service, repository } = build();
      repository.deleteMine.mockResolvedValue(0);

      await expect(service.mine(student, 3)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.removeMine(student, 3)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('con reseña la devuelve y la borra', async () => {
      const { service, repository } = build();
      repository.findMine.mockResolvedValue({ id: 11, rating: 5 });

      await expect(service.mine(student, 3)).resolves.toMatchObject({ rating: 5 });
      await expect(service.removeMine(student, 3)).resolves.toEqual({ deleted: true });
    });
  });

  describe('vista pública', () => {
    it('muestra el nombre con la inicial del apellido, no el apellido completo', async () => {
      const { service } = build();

      const result = await service.listPublic(3, {});

      expect(result.items[0]).toMatchObject({ rating: 5, author: 'Ana R.' });
      expect(JSON.stringify(result)).not.toContain('Pérez');
      expect(result.items[0]).not.toHaveProperty('user');
    });

    it('el resumen trae promedio, cantidad y distribución', async () => {
      const { service } = build();

      await expect(service.summary(3)).resolves.toMatchObject({ average: 4.8, count: 4 });
    });

    it('un curso en borrador, archivado o privado "no existe" para el público', async () => {
      const { service, access } = build();

      for (const override of [{ status: 'DRAFT' }, { status: 'ARCHIVED' }, { visibility: 'PRIVATE' }]) {
        access.getCourseOrThrow.mockResolvedValue({ ...published, ...override });

        await expect(service.listPublic(3, {})).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.summary(3)).rejects.toBeInstanceOf(NotFoundException);
      }
    });
  });

  describe('ratingsOf (para el catálogo)', () => {
    it('devuelve promedio y cantidad por curso, y null para los que no tienen reseñas', async () => {
      const { service, repository } = build();
      repository.averagesOf.mockResolvedValue([{ courseId: 3, average: 4.333, count: 6 }]);

      const result = await service.ratingsOf([3, 8]);

      expect(result.get(3)).toEqual({ average: 4.3, count: 6 });
      expect(result.get(8)).toEqual({ average: null, count: 0 });
    });

    it('sin cursos no consulta la base', async () => {
      const { service, repository } = build();

      expect((await service.ratingsOf([])).size).toBe(0);
      expect(repository.averagesOf).not.toHaveBeenCalled();
    });
  });

  describe('listForTeacher', () => {
    it('un docente ve las de sus cursos; un admin, todas', async () => {
      const { service, repository } = build();

      await service.listForTeacher(teacher, { rating: 4 });
      await service.listForTeacher(admin, {});

      expect(repository.findForTeacher).toHaveBeenNthCalledWith(1, { teacherId: 7, courseId: undefined, rating: 4, take: 20, skip: 0 });
      expect(repository.findForTeacher).toHaveBeenNthCalledWith(2, { teacherId: undefined, courseId: undefined, rating: undefined, take: 20, skip: 0 });
    });

    it('con courseId comprueba que gestione ese curso', async () => {
      const { service, access, repository } = build();
      access.assertCanManage.mockRejectedValue(new ForbiddenException());

      await expect(service.listForTeacher(teacher, { courseId: 99 })).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.findForTeacher).not.toHaveBeenCalled();
    });

    it('devuelve al estudiante como "student", con nombre completo para el docente', async () => {
      const { service } = build();

      const result = await service.listForTeacher(teacher, {});

      expect(result.items[0].student).toEqual({ id: 5, firstName: 'Ana', lastName: 'Ruiz' });
    });
  });
});
