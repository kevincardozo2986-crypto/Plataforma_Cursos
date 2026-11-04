import { Injectable, inject } from '@angular/core';

import { HttpClient, HttpParams } from '@angular/common/http';

import { Observable } from 'rxjs';

import { CoursesResponse } from './courses.models';

@Injectable({
  providedIn: 'root',
})
export class CoursesService {
  private readonly http = inject(HttpClient);

  /** El catálogo viene de a 12 cursos; `page` pide las siguientes páginas (la primera no lleva parámetros). */
  getCourses(page = 1): Observable<CoursesResponse> {
    const params = page > 1 ? new HttpParams().set('page', page) : undefined;

    return this.http.get<CoursesResponse>('/api/courses', { params });
  }
}
