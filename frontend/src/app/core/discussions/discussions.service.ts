import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type DiscussionKind = 'QUESTION' | 'COMMENT';

export interface DiscussionAuthor {
  id: number;
  firstName: string;
  lastName: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
}

export interface Discussion {
  id: number;
  kind: DiscussionKind;
  title: string | null;
  /** Texto plano. */
  body: string;
  answered: boolean;
  createdAt: string;
  updatedAt: string;
  author: DiscussionAuthor;
  course: { id: number; title: string };
  lesson: { id: number; title: string } | null;
  _count: { replies: number };
}

export interface Reply {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: DiscussionAuthor;
}

export interface DiscussionThread extends Omit<Discussion, '_count'> {
  replies: Reply[];
}

export interface DiscussionPage {
  total: number;
  items: Discussion[];
}

@Injectable({ providedIn: 'root' })
export class DiscussionsService {
  private readonly http = inject(HttpClient);

  list(options: {
    kind?: DiscussionKind | null;
    courseId?: number | null;
    /** false = solo preguntas sin responder. */
    answered?: boolean | null;
    limit: number;
    offset: number;
  }): Observable<DiscussionPage> {
    let params = new HttpParams().set('limit', options.limit).set('offset', options.offset);

    if (options.kind) {
      params = params.set('kind', options.kind);
    }
    if (options.courseId) {
      params = params.set('courseId', options.courseId);
    }
    if (options.answered !== null && options.answered !== undefined) {
      params = params.set('answered', options.answered);
    }

    return this.http.get<DiscussionPage>('/api/discussions', { params });
  }

  get(id: number): Observable<DiscussionThread> {
    return this.http.get<DiscussionThread>(`/api/discussions/${id}`);
  }

  reply(id: number, body: string): Observable<Reply> {
    return this.http.post<Reply>(`/api/discussions/${id}/replies`, { body });
  }

  remove(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/discussions/${id}`);
  }
}
