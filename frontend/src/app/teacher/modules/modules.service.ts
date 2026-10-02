import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { CourseModule, ModuleInput } from './modules.models';

@Injectable({ providedIn: 'root' })
export class TeacherModulesService {
  private readonly http = inject(HttpClient);

  create(courseId: number, input: ModuleInput): Observable<CourseModule> {
    return this.http.post<CourseModule>(`/api/courses/${courseId}/modules`, input);
  }

  update(id: number, input: ModuleInput): Observable<CourseModule> {
    return this.http.patch<CourseModule>(`/api/modules/${id}`, input);
  }

  remove(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/modules/${id}`);
  }
}
