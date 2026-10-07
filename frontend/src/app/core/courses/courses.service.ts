import { Injectable, inject } from '@angular/core';

import { HttpClient } from '@angular/common/http';

import { Observable } from 'rxjs';

import { CoursesResponse } from './courses.models';

@Injectable({
  providedIn: 'root',
})
export class CoursesService {
  private readonly http = inject(HttpClient);

  getCourses(): Observable<CoursesResponse> {
    return this.http.get<CoursesResponse>('/api/courses');
  }
}
