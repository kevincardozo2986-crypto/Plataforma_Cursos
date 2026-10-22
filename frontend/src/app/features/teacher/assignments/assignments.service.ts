import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface Assignment {
  id: number;
  title: string;
  /** HTML ya limpio por el servidor. */
  description: string | null;
  dueAt: string | null;
  allowLate: boolean;
  maxScore: number;
  moduleId: number;
  /** Documentos que el docente adjuntó (con su dirección de descarga). */
  attachments: { name: string; originalName: string; size: number; url: string }[];
  /** Solo en la lista del módulo. */
  submissionCount?: number;
}

/** POST/PATCH. En PATCH, `dueAt: null` quita la fecha límite. */
export interface AssignmentInput {
  title?: string;
  description?: string;
  dueAt?: string | null;
  allowLate?: boolean;
  maxScore?: number;
  /** Los documentos que debe tener la tarea (reemplazan a los anteriores). */
  attachments?: { name: string }[];
}

@Injectable({ providedIn: 'root' })
export class TeacherAssignmentsService {
  private readonly http = inject(HttpClient);

  listByModule(moduleId: number): Observable<Assignment[]> {
    return this.http.get<Assignment[]>(`/api/modules/${moduleId}/assignments`);
  }

  get(id: number): Observable<Assignment> {
    return this.http.get<Assignment>(`/api/assignments/${id}`);
  }

  create(moduleId: number, input: AssignmentInput): Observable<Assignment> {
    return this.http.post<Assignment>(`/api/modules/${moduleId}/assignments`, input);
  }

  update(id: number, input: AssignmentInput): Observable<Assignment> {
    return this.http.patch<Assignment>(`/api/assignments/${id}`, input);
  }

  remove(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/assignments/${id}`);
  }
}
