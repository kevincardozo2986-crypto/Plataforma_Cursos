import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface TeacherReview {
  id: number;
  rating: number;
  /** Texto plano; puede no haberlo. */
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  student: { id: number; firstName: string; lastName: string };
  course: { id: number; title: string };
}

export interface ReviewPage {
  total: number;
  items: TeacherReview[];
}

/** Promedio y reparto de estrellas de un curso. */
export interface ReviewSummary {
  /** null si todavía no hay reseñas (no se debe mostrar «0 estrellas»). */
  average: number | null;
  count: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

@Injectable({ providedIn: 'root' })
export class ReviewsService {
  private readonly http = inject(HttpClient);

  /** Las reseñas de los cursos del docente (el admin ve todas). */
  list(options: {
    courseId?: number | null;
    rating?: number | null;
    limit: number;
    offset: number;
  }): Observable<ReviewPage> {
    let params = new HttpParams().set('limit', options.limit).set('offset', options.offset);

    if (options.courseId) {
      params = params.set('courseId', options.courseId);
    }
    if (options.rating) {
      params = params.set('rating', options.rating);
    }

    return this.http.get<ReviewPage>('/api/reviews', { params });
  }

  /** Pública: solo existe para cursos publicados y no privados. */
  summary(courseId: number): Observable<ReviewSummary> {
    return this.http.get<ReviewSummary>(`/api/courses/${courseId}/reviews/summary`);
  }
}
