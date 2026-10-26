import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Period } from './dashboard.service';

export type StudentState = 'COMPLETED' | 'IN_PROGRESS' | 'INACTIVE' | 'CANCELLED';

export const STUDENT_STATE_LABELS: Record<StudentState, string> = {
  COMPLETED: 'Terminó',
  IN_PROGRESS: 'En progreso',
  INACTIVE: 'Inactivo',
  CANCELLED: 'Canceló',
};

export interface StudentRow {
  enrollmentId: number;
  student: { id: number; firstName: string; lastName: string; email: string };
  course: { id: number; title: string };
  state: StudentState;
  enrolledAt: string;
  completedAt: string | null;
  lastActivityAt: string | null;
  progress: { completed: number; total: number; percent: number };
  /** Promedio de los quizzes calificados (0–100); null si no ha hecho ninguno. */
  quizAverage: number | null;
  /** Promedio de las tareas calificadas, en porcentaje de su puntaje máximo. */
  taskAverage: number | null;
}

export interface StudentsPage {
  total: number;
  inactiveAfterDays: number;
  items: StudentRow[];
}

export interface RatingsReport {
  count: number;
  average: number | null;
  distribution: { stars: number; count: number; percent: number }[];
  recent: {
    id: number;
    rating: number;
    comment: string | null;
    createdAt: string;
    student: string;
    course: { id: number; title: string };
  }[];
}

export interface StudentsQuery {
  period: Period;
  courseId?: number | null;
  state?: StudentState | '' | null;
  q?: string;
  limit: number;
  offset: number;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);

  students(query: StudentsQuery): Observable<StudentsPage> {
    let params = new HttpParams()
      .set('period', query.period)
      .set('limit', query.limit)
      .set('offset', query.offset);

    if (query.courseId) params = params.set('courseId', query.courseId);
    if (query.state) params = params.set('state', query.state);
    if (query.q?.trim()) params = params.set('q', query.q.trim());

    return this.http.get<StudentsPage>('/api/dashboard/teacher/students', { params });
  }

  ratings(period: Period, courseId?: number | null): Observable<RatingsReport> {
    let params = new HttpParams().set('period', period);

    if (courseId) params = params.set('courseId', courseId);

    return this.http.get<RatingsReport>('/api/dashboard/teacher/ratings', { params });
  }
}
