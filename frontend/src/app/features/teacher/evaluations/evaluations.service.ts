import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Evaluation, EvaluationInput, EvaluationSummary } from './evaluations.models';

@Injectable({ providedIn: 'root' })
export class TeacherEvaluationsService {
  private readonly http = inject(HttpClient);

  listByModule(moduleId: number): Observable<EvaluationSummary[]> {
    return this.http.get<EvaluationSummary[]>(`/api/modules/${moduleId}/evaluations`);
  }

  get(id: number): Observable<Evaluation> {
    return this.http.get<Evaluation>(`/api/evaluations/${id}`);
  }

  create(moduleId: number, input: EvaluationInput): Observable<Evaluation> {
    return this.http.post<Evaluation>(`/api/modules/${moduleId}/evaluations`, input);
  }

  update(id: number, input: EvaluationInput): Observable<Evaluation> {
    return this.http.patch<Evaluation>(`/api/evaluations/${id}`, input);
  }

  remove(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/evaluations/${id}`);
  }
}
