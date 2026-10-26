import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

/** Un archivo descargable del curso. */
export interface CourseFile {
  id: number;
  originalName: string;
  size: number;
  createdAt: string;
  /** Requiere sesión: se pide con `HttpClient` como blob. */
  url: string;
}

@Injectable({ providedIn: 'root' })
export class CourseFilesService {
  private readonly http = inject(HttpClient);

  list(courseId: number): Observable<CourseFile[]> {
    return this.http.get<CourseFile[]>(`/api/courses/${courseId}/files`);
  }

  /** Adjunta un documento ya subido (el `name` que devolvió la subida). */
  attach(courseId: number, name: string): Observable<CourseFile> {
    return this.http.post<CourseFile>(`/api/courses/${courseId}/files`, { name });
  }

  remove(courseId: number, fileId: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/courses/${courseId}/files/${fileId}`);
  }

  download(file: CourseFile): Observable<Blob> {
    return this.http.get(file.url, { responseType: 'blob' });
  }
}
