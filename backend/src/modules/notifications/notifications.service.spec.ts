import { Logger, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import type { NotificationsRepository } from './notifications.repository.js';
import { NotificationsService } from './notifications.service.js';

const user = { id: 5, role: Role.STUDENT } as AuthenticatedUser;
const data = { type: 'ANNOUNCEMENT' as const, title: 'Hola', courseId: 1, refId: 2 };

function build() {
  const repository = {
    createForUsers: vi.fn((ids: number[]) => Promise.resolve(ids.length)),
    findByUser: vi.fn().mockResolvedValue({ items: [{ id: 1 }], total: 1 }),
    countUnread: vi.fn().mockResolvedValue(3),
    markRead: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(1),
    markAllRead: vi.fn().mockResolvedValue(4),
  };
  const service = new NotificationsService(repository as unknown as NotificationsRepository);

  return { service, repository };
}

describe('NotificationsService', () => {
  describe('notify', () => {
    it('quita repetidos y a quien hizo la acción', async () => {
      const { service, repository } = build();

      const created = await service.notify([1, 2, 2, 3, 7], data, 7);

      expect(created).toBe(3);
      expect(repository.createForUsers).toHaveBeenCalledWith([1, 2, 3], data);
    });

    it('sin destinatarios no consulta la base', async () => {
      const { service, repository } = build();

      expect(await service.notify([], data)).toBe(0);
      expect(await service.notify([7], data, 7)).toBe(0);
      expect(repository.createForUsers).not.toHaveBeenCalled();
    });

    it('con muchos destinatarios inserta por tandas de 1000', async () => {
      const { service, repository } = build();
      const ids = Array.from({ length: 2500 }, (_, i) => i + 1);

      expect(await service.notify(ids, data)).toBe(2500);
      expect(repository.createForUsers.mock.calls.map(([batch]) => batch.length)).toEqual([1000, 1000, 500]);
    });

    it('un fallo se registra pero no rompe la acción que lo originó', async () => {
      const { service, repository } = build();
      const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      repository.createForUsers.mockRejectedValue(new Error('base caída'));

      await expect(service.notify([1, 2], data)).resolves.toBe(0);
      expect(error).toHaveBeenCalled();
      error.mockRestore();
    });
  });

  describe('list', () => {
    it('devuelve el total, las no leídas y un límite por defecto', async () => {
      const { service, repository } = build();

      const result = await service.list(user, {});

      expect(result).toEqual({ total: 1, unread: 3, items: [{ id: 1 }] });
      expect(repository.findByUser).toHaveBeenCalledWith(5, { unreadOnly: false, take: 20, skip: 0 });
    });

    it('puede pedir solo las no leídas', async () => {
      const { service, repository } = build();

      await service.list(user, { unread: true, limit: 5, offset: 10 });

      expect(repository.findByUser).toHaveBeenCalledWith(5, { unreadOnly: true, take: 5, skip: 10 });
    });
  });

  describe('markRead', () => {
    it('marca un aviso propio', async () => {
      const { service, repository } = build();

      await expect(service.markRead(user, 9)).resolves.toEqual({ read: true });
      expect(repository.markRead).toHaveBeenCalledWith(9, 5);
    });

    it('volver a marcar uno ya leído no es un error', async () => {
      const { service, repository } = build();
      repository.markRead.mockResolvedValue(0);

      await expect(service.markRead(user, 9)).resolves.toEqual({ read: true });
    });

    it('uno ajeno o inexistente responde 404', async () => {
      const { service, repository } = build();
      repository.markRead.mockResolvedValue(0);
      repository.exists.mockResolvedValue(0);

      await expect(service.markRead(user, 9)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('marcar todas devuelve cuántas cambió', async () => {
    const { service } = build();

    await expect(service.markAllRead(user)).resolves.toEqual({ marked: 4 });
  });
});
