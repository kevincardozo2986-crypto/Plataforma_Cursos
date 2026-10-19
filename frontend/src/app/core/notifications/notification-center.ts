import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, EMPTY, switchMap, timer } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { notificationLink } from './notification-link';
import { AppNotification, NotificationsService } from './notifications.service';

/** Cada cuánto se pregunta cuántas hay sin leer (mientras haya sesión). */
const POLL_MS = 60_000;

/**
 * El estado de las notificaciones que comparten la campana del encabezado y la página con todas:
 * el número de sin leer (se actualiza solo) y lo que pasa al tocar un aviso.
 */
@Injectable({ providedIn: 'root' })
export class NotificationCenter {
  private readonly api = inject(NotificationsService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly unread = signal(0);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }

    // Al iniciar sesión empieza a consultar; al cerrarla, para y vuelve a cero.
    toObservable(this.auth.user)
      .pipe(
        switchMap((user) => {
          if (!user) {
            this.unread.set(0);
            return EMPTY;
          }

          return timer(0, POLL_MS).pipe(
            switchMap(() =>
              // Un fallo de red no debe romper la campana: se reintenta en la siguiente vuelta.
              this.api.unreadCount().pipe(catchError(() => EMPTY)),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ unread }) => this.unread.set(unread));
  }

  refresh(): void {
    this.api
      .unreadCount()
      .pipe(catchError(() => EMPTY))
      .subscribe(({ unread }) => this.unread.set(unread));
  }

  /**
   * Marca el aviso como leído y lleva a su pantalla (si la tiene). Devuelve el aviso ya marcado
   * para que quien lo muestra lo actualice sin volver a pedir la lista.
   */
  open(notification: AppNotification): AppNotification {
    const wasUnread = notification.readAt === null;
    const opened = wasUnread ? { ...notification, readAt: new Date().toISOString() } : notification;

    if (wasUnread) {
      // Se actualiza al instante; si el servidor falla, la próxima consulta corrige el número.
      this.unread.update((count) => Math.max(0, count - 1));
      this.api
        .markRead(notification.id)
        .pipe(catchError(() => EMPTY))
        .subscribe();
    }

    const link = notificationLink(notification, this.auth.user()?.role);

    if (link) {
      void this.router.navigate(link);
    }

    return opened;
  }

  markAllRead(): void {
    this.unread.set(0);
    this.api
      .markAllRead()
      .pipe(catchError(() => EMPTY))
      .subscribe();
  }
}
