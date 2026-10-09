import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface Announcement {
  id: number;
  title: string;
  /** HTML ya limpio por el servidor: se puede mostrar con [innerHTML]. */
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: number; firstName: string; lastName: string };
  course: { id: number; title: string };
}

export interface AnnouncementPage {
  total: number;
  items: Announcement[];
}

export interface AnnouncementInput {
  title: string;
  body: string;
  /** Avisar a los inscritos con una notificación (por defecto sí). */
  notify?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AnnouncementsService {
  private readonly http = inject(HttpClient);

  list(options: {
    courseId?: number | null;
    limit: number;
    offset: number;
  }): Observable<AnnouncementPage> {
    let params = new HttpParams().set('limit', options.limit).set('offset', options.offset);

    if (options.courseId) {
      params = params.set('courseId', options.courseId);
    }

    return this.http.get<AnnouncementPage>('/api/announcements', { params });
  }

  create(
    courseId: number,
    input: AnnouncementInput,
  ): Observable<Announcement & { notified: number }> {
    return this.http.post<Announcement & { notified: number }>(
      `/api/courses/${courseId}/announcements`,
      input,
    );
  }

  update(
    id: number,
    input: Partial<Pick<AnnouncementInput, 'title' | 'body'>>,
  ): Observable<Announcement> {
    return this.http.patch<Announcement>(`/api/announcements/${id}`, input);
  }

  remove(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/announcements/${id}`);
  }
}
