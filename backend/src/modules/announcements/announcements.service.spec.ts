import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { ProgressService } from '../progress/progress.service.js';
import type { AnnouncementsRepository } from './announcements.repository.js';
import { AnnouncementsService } from './announcements.service.js';

const teacher = { id: 7, role: Role.TEACHER } as AuthenticatedUser;
const admin = { id: 1, role: Role.ADMIN } as AuthenticatedUser;
const student = { id: 5, role: Role.STUDENT } as AuthenticatedUser;

function build() {
  const repository = {
    create: vi.fn((data: object) => Promise.resolve({ id: 11, ...data })),
    findById: vi.fn().mockResolvedValue({ id: 11, courseId: 3 }),
    update: vi.fn().mockResolvedValue({ id: 11 }),
    delete: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };
  const access = { assertCanManage: vi.fn().mockResolvedValue({ id: 3, title: 'Angular' }) };
  const progress = {
    enrolledUserIds: vi.fn().mockResolvedValue([5, 6, 7]),
    enrolledCourseIds: vi.fn().mockResolvedValue([3, 4]),
  };
  const notifications = { notify: vi.fn().mockResolvedValue(2) };

  const service = new AnnouncementsService(
    repository as unknown as AnnouncementsRepository,
    access as unknown as CourseAccessService,
    progress as unknown as ProgressService,
    notifications as unknown as NotificationsService,
  );

  return { service, repository, access, progress, notifications };
}

describe('AnnouncementsService', () => {
  describe('create', () => {
    it('publica y avisa a los inscritos, menos a quien lo escribe', async () => {
      const { service, notifications } = build();

      const result = await service.create(teacher, 3, { title: 'Cambio de horario', body: '<p>Mañana a las 8</p>' });

      expect(result).toMatchObject({ id: 11, courseId: 3, authorId: 7, notified: 2 });
      expect(notifications.notify).toHaveBeenCalledWith(
        [5, 6, 7],
        { type: 'ANNOUNCEMENT', title: 'Cambio de horario', message: 'Nuevo anuncio en «Angular»', courseId: 3, refId: 11 },
        7,
      );
    });

    it('con notify: false publica sin avisar', async () => {
      const { service, notifications } = build();

      const result = await service.create(teacher, 3, { title: 'Aviso', body: '<p>x</p>', notify: false });

      expect(result.notified).toBe(0);
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('rechaza un anuncio sin texto visible, aunque tenga etiquetas', async () => {
      const { service, repository } = build();

      await expect(service.create(teacher, 3, { title: 'Aviso', body: '<p><br></p>' })).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('quien no gestiona el curso no puede publicar', async () => {
      const { service, access, repository } = build();
      access.assertCanManage.mockRejectedValue(new ForbiddenException());

      await expect(service.create(teacher, 3, { title: 'Aviso', body: '<p>x</p>' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('un docente ve solo los anuncios de sus cursos', async () => {
      const { service, repository } = build();

      await service.list(teacher, {});

      expect(repository.findMany).toHaveBeenCalledWith({ courseId: undefined, scope: { teacherId: 7 }, take: 20, skip: 0 });
    });

    it('un admin ve los de todos los cursos', async () => {
      const { service, repository } = build();

      await service.list(admin, { limit: 5 });

      expect(repository.findMany).toHaveBeenCalledWith({ courseId: undefined, scope: null, take: 5, skip: 0 });
    });

    it('un estudiante ve los de los cursos donde está inscrito', async () => {
      const { service, repository } = build();

      await service.list(student, {});

      expect(repository.findMany).toHaveBeenCalledWith({ courseId: undefined, scope: { courseIds: [3, 4] }, take: 20, skip: 0 });
    });

    it('un estudiante no puede pedir los anuncios de un curso donde no está inscrito', async () => {
      const { service, repository } = build();

      await expect(service.list(student, { courseId: 99 })).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.findMany).not.toHaveBeenCalled();
    });

    it('un docente que filtra por un curso ajeno recibe 403', async () => {
      const { service, access } = build();
      access.assertCanManage.mockRejectedValue(new ForbiddenException());

      await expect(service.list(teacher, { courseId: 99 })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('update y remove', () => {
    it('comprueban que se gestione el curso del anuncio', async () => {
      const { service, access } = build();

      await service.update(teacher, 11, { title: 'Nuevo' });
      await service.remove(teacher, 11);

      expect(access.assertCanManage).toHaveBeenCalledWith(teacher, 3);
    });

    it('un anuncio inexistente responde 404', async () => {
      const { service, repository } = build();
      repository.findById.mockResolvedValue(null);

      await expect(service.update(teacher, 99, { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(teacher, 99)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('no se puede dejar vacío al editar', async () => {
      const { service } = build();

      await expect(service.update(teacher, 11, { body: '<p></p>' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
