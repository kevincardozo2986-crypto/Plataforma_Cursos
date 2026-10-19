import { Component, computed, inject, signal } from '@angular/core';

import { apiErrorMessage } from '../../core/http/api-error';
import { NotificationCenter } from '../../core/notifications/notification-center';
import { timeAgo } from '../../core/notifications/notification-link';
import {
  AppNotification,
  NotificationsService,
} from '../../core/notifications/notifications.service';
import { PageHeader } from '../../shared/ui/page-header/page-header';

const PAGE_SIZE = 20;

/** Todas las notificaciones de quien tiene la sesión (docente, estudiante o administrador). */
@Component({
  selector: 'app-notifications-page',
  imports: [PageHeader],
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.scss',
})
export class NotificationsPage {
  private readonly api = inject(NotificationsService);
  readonly center = inject(NotificationCenter);

  readonly timeAgo = timeAgo;

  readonly items = signal<AppNotification[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly onlyUnread = signal(false);
  readonly offset = signal(0);

  readonly from = computed(() => (this.total() === 0 ? 0 : this.offset() + 1));
  readonly to = computed(() => Math.min(this.offset() + PAGE_SIZE, this.total()));
  readonly hasPrev = computed(() => this.offset() > 0);
  readonly hasNext = computed(() => this.offset() + PAGE_SIZE < this.total());

  constructor() {
    this.load();
  }

  setUnread(only: boolean): void {
    this.onlyUnread.set(only);
    this.offset.set(0);
    this.load();
  }

  page(step: 1 | -1): void {
    this.offset.update((value) => Math.max(0, value + step * PAGE_SIZE));
    this.load();
  }

  select(notification: AppNotification): void {
    const opened = this.center.open(notification);

    this.items.update((list) => list.map((item) => (item.id === opened.id ? opened : item)));
  }

  markAll(): void {
    this.center.markAllRead();
    this.items.update((list) =>
      list.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    );
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .list({ unread: this.onlyUnread(), limit: PAGE_SIZE, offset: this.offset() })
      .subscribe({
        next: (page) => {
          this.items.set(page.items);
          this.total.set(page.total);
          this.center.unread.set(page.unread);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos cargar tus notificaciones.'));
          this.loading.set(false);
        },
      });
  }
}
