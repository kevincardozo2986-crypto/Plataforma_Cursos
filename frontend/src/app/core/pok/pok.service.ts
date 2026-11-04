import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

/** Conexión con POK: `enabled: false` si el servidor no tiene la clave de API. */
export type PokConnection =
  | { enabled: false }
  | {
      enabled: true;
      organization: { name: string; availableCredits: number } | null;
      /** true = las credenciales quedan en borrador en POK (no gastan créditos ni envían correos). */
      draftMode: boolean;
      emitter: string;
      webhookConfigured: boolean;
    };

/** Un diseño de certificado de la cuenta de POK. */
export interface PokTemplate {
  id: string;
  name: string;
  tags: string[];
}

/** Un curso con el diseño de POK que usa. */
export interface PokCourse {
  id: number;
  title: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  pokTemplateId: string | null;
  pokTemplateName: string | null;
  /** Certificados de POK vigentes que todavía no están allá. */
  unsent: number;
}

export interface PokSendResult {
  total: number;
  sent: number;
  failed: number;
}

@Injectable({ providedIn: 'root' })
export class PokService {
  private readonly http = inject(HttpClient);

  status(): Observable<PokConnection> {
    return this.http.get<PokConnection>('/api/pok/status');
  }

  templates(): Observable<PokTemplate[]> {
    return this.http.get<PokTemplate[]>('/api/pok/templates');
  }

  /** La imagen real de cómo se ve la credencial de POK con ese diseño (la genera POK). */
  preview(templateId: string, courseTitle: string): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`/api/pok/templates/${encodeURIComponent(templateId)}/preview`, {
      params: new HttpParams().set('title', courseTitle),
    });
  }

  courses(): Observable<PokCourse[]> {
    return this.http.get<PokCourse[]>('/api/pok/courses');
  }

  /**
   * El curso emite en POK con este diseño; `null` vuelve al certificado de la plataforma (es uno u otro).
   * `issued`: a cuántas personas que ya habían terminado se les emitió su credencial.
   */
  setTemplate(
    courseId: number,
    pokTemplateId: string | null,
  ): Observable<{
    courseId: number;
    pokTemplateId: string | null;
    pokTemplateName: string | null;
    issued: number;
  }> {
    return this.http.put<{
      courseId: number;
      pokTemplateId: string | null;
      pokTemplateName: string | null;
      issued: number;
    }>(`/api/pok/courses/${courseId}/template`, { pokTemplateId });
  }

  /** Envía a POK los certificados del curso que todavía no están allá. */
  sendPending(courseId: number): Observable<PokSendResult> {
    return this.http.post<PokSendResult>(`/api/pok/courses/${courseId}/send-pending`, {});
  }
}
