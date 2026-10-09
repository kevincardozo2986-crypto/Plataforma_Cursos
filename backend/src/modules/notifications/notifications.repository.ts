import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { NotificationType } from '../../generated/prisma/enums.js';

export interface NewNotification {
  type: NotificationType;
  title: string;
  message?: string;
  courseId?: number;
  refId?: number;
}

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Crea el mismo aviso para varios usuarios en una sola consulta. */
  async createForUsers(userIds: number[], data: NewNotification) {
    const result = await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({ ...data, userId })),
    });

    return result.count;
  }

  async findByUser(
    userId: number,
    options: { unreadOnly: boolean; take: number; skip: number },
  ) {
    const where = {
      userId,
      ...(options.unreadOnly ? { readAt: null } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.take,
        skip: options.skip,
        omit: { userId: true },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { items, total };
  }

  countUnread(userId: number) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Marca como leído un aviso del usuario. Devuelve cuántos cambió (0 si no existe o no es suyo). */
  async markRead(id: number, userId: number): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });

    return result.count;
  }

  exists(id: number, userId: number) {
    return this.prisma.notification.count({ where: { id, userId } });
  }

  async markAllRead(userId: number): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return result.count;
  }
}
