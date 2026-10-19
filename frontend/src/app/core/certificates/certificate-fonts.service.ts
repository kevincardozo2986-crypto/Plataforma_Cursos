import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { FontCatalog, FontOption } from './certificates.models';

const EMPTY: FontCatalog = { standard: [], library: [], custom: [] };

/** Las tipografías disponibles para los certificados, con lo necesario para subir y borrar las propias. */
@Injectable({ providedIn: 'root' })
export class CertificateFontsService {
  private readonly http = inject(HttpClient);

  readonly catalog = signal<FontCatalog>(EMPTY);
  readonly loaded = signal(false);

  /** Todas en una lista: primero las propias, luego las de la plataforma. */
  readonly options = computed<FontOption[]>(() => {
    const { standard, library, custom } = this.catalog();

    return [...custom, ...standard, ...library];
  });

  /** La tipografía con esa clave, o undefined si aún no cargó el catálogo o ya no existe. */
  find(key: string): FontOption | undefined {
    return this.options().find((option) => option.key === key);
  }

  /** Pide el catálogo una sola vez; `force` lo vuelve a pedir (por ejemplo tras subir una). */
  load(force = false): void {
    if (this.loaded() && !force) {
      return;
    }

    this.http.get<FontCatalog>('/api/certificate-fonts').subscribe({
      next: (catalog) => {
        this.catalog.set(catalog);
        this.loaded.set(true);
      },
      // Sin catálogo todo se sigue viendo (con Helvetica); no se bloquea nada.
      error: () => this.loaded.set(true),
    });
  }

  /** Sube una tipografía propia (.ttf, .otf, .woff o .woff2, hasta 2 MB). */
  upload(file: File, name?: string): Observable<{ id: number; key: string; label: string }> {
    const form = new FormData();

    form.append('file', file, file.name);

    if (name?.trim()) {
      form.append('name', name.trim());
    }

    return this.http
      .post<{ id: number; key: string; label: string }>('/api/certificate-fonts/custom', form)
      .pipe(tap(() => this.load(true)));
  }

  remove(id: number): Observable<{ deleted: boolean }> {
    return this.http
      .delete<{ deleted: boolean }>(`/api/certificate-fonts/custom/${id}`)
      .pipe(tap(() => this.load(true)));
  }

  /** El archivo de una propia (pide sesión, por eso no se puede usar en un @font-face directo). */
  file(url: string): Observable<ArrayBuffer> {
    return this.http.get(url, { responseType: 'arraybuffer' });
  }
}
