import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { UploadKind } from './upload-rules';

export type UploadEvent =
  { type: 'progress'; percent: number } | { type: 'done'; url: string; name: string; size: number };

const ENDPOINTS: Record<UploadKind, string> = {
  image: '/api/uploads/images',
  video: '/api/uploads/videos',
};

/** El mismo token que usa el interceptor de autenticación. */
function readToken(): string | null {
  try {
    return (
      localStorage.getItem('campus.accessToken') ?? sessionStorage.getItem('campus.accessToken')
    );
  } catch {
    return null;
  }
}

/**
 * Sube un archivo y avisa del avance. Usa XMLHttpRequest a propósito: el
 * cliente HTTP de la aplicación trabaja sobre fetch, que no informa del
 * progreso de una subida, y un video puede tardar varios minutos.
 * Al cancelar la suscripción, la subida se aborta.
 */
@Injectable({ providedIn: 'root' })
export class UploadsService {
  upload(kind: UploadKind, file: File): Observable<UploadEvent> {
    return new Observable<UploadEvent>((subscriber) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append('file', file, file.name);

      xhr.open('POST', ENDPOINTS[kind]);

      const token = readToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          subscriber.next({
            type: 'progress',
            percent: Math.round((event.loaded / event.total) * 100),
          });
        }
      };

      xhr.onload = () => {
        const body = this.parse(xhr.responseText);

        if (xhr.status >= 200 && xhr.status < 300 && typeof body?.['url'] === 'string') {
          subscriber.next({
            type: 'done',
            url: body['url'],
            name: String(body['name'] ?? file.name),
            size: Number(body['size'] ?? file.size),
          });
          subscriber.complete();
          return;
        }

        subscriber.error(new Error(this.messageFor(xhr.status, body)));
      };

      xhr.onerror = () =>
        subscriber.error(
          new Error(
            'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
          ),
        );

      xhr.send(form);

      return () => xhr.abort();
    });
  }

  private parse(text: string): Record<string, unknown> | null {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private messageFor(status: number, body: Record<string, unknown> | null): string {
    if (status === 413) {
      return 'El archivo es demasiado grande.';
    }
    if (status === 401 || status === 403) {
      return 'Tu sesión no permite subir archivos. Vuelve a iniciar sesión.';
    }

    const message = body?.['message'];

    if (Array.isArray(message)) {
      return message.join(' · ');
    }

    return typeof message === 'string' ? message : 'No pudimos subir el archivo.';
  }
}
