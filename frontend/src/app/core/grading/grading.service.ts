import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface Person {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

// ---------- Quizzes ----------

export type AttemptStatus = 'PENDING_REVIEW' | 'GRADED';
export type QuestionType = 'TRUE_FALSE' | 'SINGLE' | 'MULTIPLE' | 'FILL_BLANK' | 'ESSAY';

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  TRUE_FALSE: 'Verdadero o falso',
  SINGLE: 'Opción única',
  MULTIPLE: 'Varias respuestas',
  FILL_BLANK: 'Completar la palabra',
  ESSAY: 'Pregunta abierta',
};

export interface AttemptRow {
  id: number;
  status: AttemptStatus;
  score: number;
  passed: boolean;
  createdAt: string;
  gradedAt: string | null;
  student: Person;
  evaluation: { id: number; title: string };
  course: { id: number; title: string };
}

/** Una pregunta del intento, con lo que respondió el estudiante y lo esperado. */
export interface AttemptQuestion {
  questionId: number;
  text: string;
  type: QuestionType;
  points: number;
  /** null mientras una abierta espera calificación. */
  correct: boolean | null;
  earned: number | null;
  chosen?: string[];
  written?: string;
  expected?: string[];
  graded?: boolean;
  comment?: string;
}

export interface AttemptDetail extends AttemptRow {
  feedback: string | null;
  earnedPoints: number;
  totalPoints: number;
  questions: AttemptQuestion[];
}

export interface AttemptGrade {
  grades: { questionId: number; points: number; comment?: string }[];
  feedback?: string;
}

// ---------- Tareas ----------

export type SubmissionStatus = 'SUBMITTED' | 'GRADED';

export interface SubmissionRow {
  id: number;
  status: SubmissionStatus;
  late: boolean;
  score: number | null;
  maxScore: number;
  submittedAt: string;
  gradedAt: string | null;
  student: Person;
  assignment: { id: number; title: string };
  course: { id: number; title: string };
}

export interface SubmissionFile {
  name: string;
  originalName: string;
  size: number;
  url: string;
}

export interface SubmissionDetail extends Omit<SubmissionRow, 'assignment'> {
  text: string | null;
  files: SubmissionFile[];
  feedback: string | null;
  assignment: { id: number; title: string; dueAt: string | null };
}

export interface Page<T> {
  total: number;
  items: T[];
}

/** Bandejas de revisión del docente: intentos de quiz y entregas de tareas. */
@Injectable({ providedIn: 'root' })
export class GradingService {
  private readonly http = inject(HttpClient);

  attempts(options: {
    courseId?: number | null;
    status?: AttemptStatus | null;
    limit: number;
    offset: number;
  }): Observable<Page<AttemptRow>> {
    return this.http.get<Page<AttemptRow>>('/api/evaluation-attempts', {
      params: this.params(options),
    });
  }

  attempt(id: number): Observable<AttemptDetail> {
    return this.http.get<AttemptDetail>(`/api/evaluation-attempts/${id}`);
  }

  gradeAttempt(id: number, body: AttemptGrade): Observable<AttemptDetail> {
    return this.http.patch<AttemptDetail>(`/api/evaluation-attempts/${id}/grade`, body);
  }

  submissions(options: {
    courseId?: number | null;
    status?: SubmissionStatus | null;
    limit: number;
    offset: number;
  }): Observable<Page<SubmissionRow>> {
    return this.http.get<Page<SubmissionRow>>('/api/assignment-submissions', {
      params: this.params(options),
    });
  }

  submission(id: number): Observable<SubmissionDetail> {
    return this.http.get<SubmissionDetail>(`/api/assignment-submissions/${id}`);
  }

  gradeSubmission(
    id: number,
    body: { score: number; feedback?: string },
  ): Observable<SubmissionDetail> {
    return this.http.patch<SubmissionDetail>(`/api/assignment-submissions/${id}/grade`, body);
  }

  /** El archivo es privado y pide token, así que se baja como blob. */
  file(name: string): Observable<Blob> {
    return this.http.get(`/api/submission-files/${encodeURIComponent(name)}`, {
      responseType: 'blob',
    });
  }

  private params(options: {
    courseId?: number | null;
    status?: string | null;
    limit: number;
    offset: number;
  }): HttpParams {
    let params = new HttpParams().set('limit', options.limit).set('offset', options.offset);

    if (options.courseId) {
      params = params.set('courseId', options.courseId);
    }
    if (options.status) {
      params = params.set('status', options.status);
    }

    return params;
  }
}
