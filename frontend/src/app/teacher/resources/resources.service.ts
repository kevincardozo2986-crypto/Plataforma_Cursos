import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Resource, ResourceInput } from './resources.models';

@Injectable({ providedIn: 'root' })
export class TeacherResourcesService {
  private readonly http = inject(HttpClient);

  create(lessonId: number, input: ResourceInput): Observable<Resource> {
    return this.http.post<Resource>(`/api/lessons/${lessonId}/resources`, input);
  }

  update(id: number, input: ResourceInput): Observable<Resource> {
    return this.http.patch<Resource>(`/api/resources/${id}`, input);
  }

  remove(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/resources/${id}`);
  }
}
