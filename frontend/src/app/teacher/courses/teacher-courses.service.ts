import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CategoryOption,
  CourseInput,
  CourseStatus,
  TeacherCourse,
} from './teacher-courses.models';

/** Cursos que gestiona el usuario: los suyos (profesor) o todos (administrador). */
@Injectable({ providedIn: 'root' })
export class TeacherCoursesService {
  private readonly http = inject(HttpClient);

  list(): Observable<TeacherCourse[]> {
    return this.http.get<TeacherCourse[]>('/api/courses/manage');
  }

  get(id: number): Observable<TeacherCourse> {
    return this.http.get<TeacherCourse>(`/api/courses/manage/${id}`);
  }

  create(input: CourseInput): Observable<TeacherCourse> {
    return this.http.post<TeacherCourse>('/api/courses', input);
  }

  update(id: number, input: Partial<CourseInput>): Observable<TeacherCourse> {
    return this.http.patch<TeacherCourse>(`/api/courses/${id}`, input);
  }

  setStatus(id: number, status: CourseStatus): Observable<TeacherCourse> {
    return this.http.patch<TeacherCourse>(`/api/courses/${id}/status`, { status });
  }

  remove(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/courses/${id}`);
  }

  categories(): Observable<CategoryOption[]> {
    return this.http.get<CategoryOption[]>('/api/categories');
  }
}
