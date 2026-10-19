import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type NotificationType =
  | 'ANNOUNCEMENT'
  | 'NEW_QUESTION'
  | 'NEW_REPLY'
  | 'NEW_REVIEW'
  | 'GRADED_ASSIGNMENT'
  | 'GRADED_QUIZ'
  | 'INSTRUCTOR_ADDED'
  | 'CERTIFICATE_ISSUED';

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  courseId: number | null;
  /** Qué es depende del tipo (ver notification-link.ts). */
  refId: number | null;
  /** null = sin leer. */
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  total: number;
  unread: number;
  items: AppNotification[];
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);

  list(options: { unread?: boolean; limit: number; offset: number }): Observable<NotificationPage> {
    let params = new HttpParams().set('limit', options.limit).set('offset', options.offset);

    if (options.unread) {
      params = params.set('unread', true);
    }

    return this.http.get<NotificationPage>('/api/notifications', { params });
  }

  /** El número de la campana. */
  unreadCount(): Observable<{ unread: number }> {
    return this.http.get<{ unread: number }>('/api/notifications/unread-count');
  }

  markRead(id: number): Observable<AppNotification> {
    return this.http.patch<AppNotification>(`/api/notifications/${id}/read`, {});
  }

  markAllRead(): Observable<{ marked: number }> {
    return this.http.patch<{ marked: number }>('/api/notifications/read-all', {});
  }
}
