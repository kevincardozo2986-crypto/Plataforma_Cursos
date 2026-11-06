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
  /** Lecciones completadas en cada una de las últimas 8 semanas (la última es la semana actual). */
  weeks: number[];
  /** Quizzes presentados / quizzes del curso; null si el curso no tiene. */
  quizzes: { done: number; total: number } | null;
  /** Tareas entregadas / tareas del curso; null si el curso no tiene. */
  tasks: { done: number; total: number } | null;
}

export interface StudentsPage {
  total: number;
  inactiveAfterDays: number;
  items: StudentRow[];
}

/** Una inscripción en detalle (panel lateral de Inscritos). */
export interface StudentDetail {
  enrollmentId: number;
  lessons: { id: number; title: string; done: boolean }[];
  weeks: number[];
  events: { kind: 'LESSON' | 'QUIZ' | 'TASK' | 'ENROLLED'; label: string; at: string }[];
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

  /** Las lecciones (en orden), la actividad semanal y lo último que hizo una inscripción. */
  studentDetail(enrollmentId: number): Observable<StudentDetail> {
    return this.http.get<StudentDetail>(`/api/dashboard/teacher/students/${enrollmentId}`);
  }

  /** Le manda al estudiante un aviso para que siga su curso (máximo uno al día por persona y curso). */
  remind(enrollmentId: number): Observable<{ sent: boolean }> {
    return this.http.post<{ sent: boolean }>(
      `/api/dashboard/teacher/students/${enrollmentId}/remind`,
      {},
    );
  }

  ratings(period: Period, courseId?: number | null): Observable<RatingsReport> {
    let params = new HttpParams().set('period', period);

    if (courseId) params = params.set('courseId', courseId);

    return this.http.get<RatingsReport>('/api/dashboard/teacher/ratings', { params });
  }
}
