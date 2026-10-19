import { Component, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { NotificationCenter } from '../../../core/notifications/notification-center';
import { timeAgo } from '../../../core/notifications/notification-link';
import {
  AppNotification,
  NotificationsService,
} from '../../../core/notifications/notifications.service';

const LATEST = 8;

/** La campana del encabezado: cuántas hay sin leer y un menú con las más recientes. */
@Component({
  selector: 'app-notification-bell',
  imports: [RouterLink],
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class NotificationBell {
  private readonly api = inject(NotificationsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly center = inject(NotificationCenter);

  readonly open = signal(false);
  readonly items = signal<AppNotification[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);

  readonly timeAgo = timeAgo;

  toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }

    this.open.set(true);
    this.load();
  }

  close(): void {
    this.open.set(false);
  }

  select(notification: AppNotification): void {
    const opened = this.center.open(notification);

    this.items.update((list) => list.map((item) => (item.id === opened.id ? opened : item)));
    this.close();
  }

  markAll(): void {
    this.center.markAllRead();
    this.items.update((list) =>
      list.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    );
  }

  /**
   * Un clic fuera cierra el menú. Se mira el camino del evento (calculado al disparar), no el
   * elemento: si el botón pulsado se reemplaza al instante por otro, ya no estaría dentro y
   * el menú se cerraría solo.
   */
  onDocumentClick(event: Event): void {
    if (this.open() && !event.composedPath().includes(this.host.nativeElement)) {
      this.close();
    }
  }

  badge(): string {
    const count = this.center.unread();

    return count > 99 ? '99+' : String(count);
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);

    this.api.list({ limit: LATEST, offset: 0 }).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.center.unread.set(page.unread);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }
}
