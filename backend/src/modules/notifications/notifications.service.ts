import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import {
  type NewNotification,
  NotificationsRepository,
} from './notifications.repository.js';

/** Máximo de avisos que se insertan en una sola consulta. */
const BATCH = 1000;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly repository: NotificationsRepository) {}

  /**
   * Para otros módulos: avisa a varias personas a la vez. Quita repetidos y a quien no
   * debe recibirlo (`except`, normalmente quien hizo la acción). Un fallo al avisar se
   * registra pero no rompe la acción que lo originó.
   * Devuelve cuántos avisos se crearon.
   */
  async notify(
    userIds: number[],
    data: NewNotification,
    except?: number,
  ): Promise<number> {
    const recipients = [...new Set(userIds)].filter((id) => id !== except);
    let created = 0;

    try {
      for (let i = 0; i < recipients.length; i += BATCH) {
        created += await this.repository.createForUsers(
          recipients.slice(i, i + BATCH),
          data,
        );
      }
    } catch (error) {
      this.logger.error(
        `No se pudieron crear las notificaciones: ${(error as Error).message}`,
      );
    }

    return created;
  }

  async list(
    user: AuthenticatedUser,
    options: { unread?: boolean; limit?: number; offset?: number },
  ) {
    const { items, total } = await this.repository.findByUser(user.id, {
      unreadOnly: options.unread ?? false,
      take: options.limit ?? 20,
      skip: options.offset ?? 0,
    });

    return { total, unread: await this.repository.countUnread(user.id), items };
  }

  async unreadCount(user: AuthenticatedUser) {
    return { unread: await this.repository.countUnread(user.id) };
  }

  /** Marcar como leído un aviso ya leído no es un error; uno ajeno o inexistente sí (404). */
  async markRead(user: AuthenticatedUser, id: number) {
    const changed = await this.repository.markRead(id, user.id);

    if (changed === 0 && (await this.repository.exists(id, user.id)) === 0) {
      throw new NotFoundException('La notificación no existe');
    }

    return { read: true };
  }

  async markAllRead(user: AuthenticatedUser) {
    return { marked: await this.repository.markAllRead(user.id) };
  }
}
