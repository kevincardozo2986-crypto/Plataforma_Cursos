import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CertificateStatus,
  CertificateTemplate,
  CertificateTemplateInput,
  IssuedCertificate,
  IssuedPage,
  MyCertificate,
  Verification,
} from './certificates.models';

@Injectable({ providedIn: 'root' })
export class CertificatesService {
  private readonly http = inject(HttpClient);

  // --- Plantillas (docente) ---

  templates(): Observable<CertificateTemplate[]> {
    return this.http.get<CertificateTemplate[]>('/api/certificate-templates');
  }

  template(id: number): Observable<CertificateTemplate> {
    return this.http.get<CertificateTemplate>(`/api/certificate-templates/${id}`);
  }

  createTemplate(input: CertificateTemplateInput): Observable<CertificateTemplate> {
    return this.http.post<CertificateTemplate>('/api/certificate-templates', input);
  }

  updateTemplate(
    id: number,
    input: Partial<CertificateTemplateInput>,
  ): Observable<CertificateTemplate> {
    return this.http.patch<CertificateTemplate>(`/api/certificate-templates/${id}`, input);
  }

  removeTemplate(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/certificate-templates/${id}`);
  }

  /** PDF de ejemplo. Pide token, así que se baja como blob (un iframe no podría). */
  preview(id: number): Observable<Blob> {
    return this.http.get(`/api/certificate-templates/${id}/preview`, { responseType: 'blob' });
  }

  // --- Emitidos ---

  issued(options: {
    courseId?: number | null;
    status?: CertificateStatus | null;
    limit: number;
    offset: number;
  }): Observable<IssuedPage> {
    let params = new HttpParams().set('limit', options.limit).set('offset', options.offset);

    if (options.courseId) {
      params = params.set('courseId', options.courseId);
    }
    if (options.status) {
      params = params.set('status', options.status);
    }

    return this.http.get<IssuedPage>('/api/certificates', { params });
  }

  revoke(id: number): Observable<IssuedCertificate> {
    return this.http.patch<IssuedCertificate>(`/api/certificates/${id}/revoke`, {});
  }

  pdf(id: number): Observable<Blob> {
    return this.http.get(`/api/certificates/${id}/pdf`, { responseType: 'blob' });
  }

  mine(): Observable<MyCertificate[]> {
    return this.http.get<MyCertificate[]>('/api/certificates/mine');
  }

  /** Pública: no necesita sesión. */
  verify(code: string): Observable<Verification> {
    return this.http.get<Verification>(`/api/certificates/verify/${encodeURIComponent(code)}`);
  }
}
