import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type Period = '7d' | '30d' | '90d' | '1y' | 'all';

export const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: '90d', label: '90 días' },
  { value: '1y', label: '1 año' },
  { value: 'all', label: 'Todo' },
];

export interface SeriesPoint {
  /** `2026-10-06` (por día) o `2026-10` (por mes). */
  date: string;
  enrollments: number;
  completions: number;
}

export interface Rating {
  /** null si todavía no hay reseñas. */
  average: number | null;
  count: number;
}

export interface CourseBreakdown {
  id: number;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  enrolled: number;
  completed: number;
  cancelled: number;
  completionRate: number;
  /** null si el curso aún no tiene intentos calificados. */
  averageScore: number | null;
  rating: Rating;
}

/** GET /dashboard/teacher */
export interface TeacherDashboard {
  period: Period;
  since: string | null;
  courses: { total: number; published: number; draft: number; archived: number };
  students: number;
  completion: {
    enrolled: number;
    completed: number;
    inProgress: number;
    inactive: number;
    cancelled: number;
    rate: number;
    inactiveAfterDays: number;
  };
  quizzes: { attempts: number; averageScore: number; passRate: number; pendingReview: number };
  assignments: { pendingGrading: number };
  rating: Rating;
  bucket: 'day' | 'month';
  series: SeriesPoint[];
  courseBreakdown: CourseBreakdown[];
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  teacher(period: Period, courseId?: number | null): Observable<TeacherDashboard> {
    let params = new HttpParams().set('period', period);

    if (courseId) {
      params = params.set('courseId', courseId);
    }

    return this.http.get<TeacherDashboard>('/api/dashboard/teacher', { params });
  }
}
