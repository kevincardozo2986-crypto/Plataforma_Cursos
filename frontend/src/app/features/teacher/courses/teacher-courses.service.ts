import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CategoryOption,
  CourseInput,
  CourseStatus,
  CourseUpdate,
  CourseWithContent,
  TeacherCourse,
} from './teacher-courses.models';

/** Cursos que gestiona el usuario: los suyos (profesor) o todos (administrador). */
@Injectable({ providedIn: 'root' })
export class TeacherCoursesService {
  private readonly http = inject(HttpClient);

  list(): Observable<TeacherCourse[]> {
    return this.http.get<TeacherCourse[]>('/api/courses/manage');
  }

  /** El mismo endpoint trae también módulos y lecciones. */
  get(id: number): Observable<CourseWithContent> {
    return this.http.get<CourseWithContent>(`/api/courses/manage/${id}`);
  }

  create(input: CourseInput): Observable<TeacherCourse> {
    return this.http.post<TeacherCourse>('/api/courses', input);
  }

  /** Borrador vacío: lo pide el asistente de creación al abrirse. */
  createDraft(): Observable<TeacherCourse> {
    return this.http.post<TeacherCourse>('/api/courses/draft', {});
  }

  update(id: number, input: CourseUpdate): Observable<TeacherCourse> {
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
