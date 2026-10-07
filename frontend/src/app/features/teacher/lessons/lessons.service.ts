import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Lesson, LessonInput, LessonWithResources } from './lessons.models';

@Injectable({ providedIn: 'root' })
export class TeacherLessonsService {
  private readonly http = inject(HttpClient);

  get(id: number): Observable<LessonWithResources> {
    return this.http.get<LessonWithResources>(`/api/lessons/${id}`);
  }

  create(moduleId: number, input: LessonInput): Observable<Lesson> {
    return this.http.post<Lesson>(`/api/modules/${moduleId}/lessons`, input);
  }

  update(id: number, input: LessonInput): Observable<Lesson> {
    return this.http.patch<Lesson>(`/api/lessons/${id}`, input);
  }

  remove(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/lessons/${id}`);
  }
}
