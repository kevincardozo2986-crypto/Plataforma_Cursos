import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CertificateFontsService } from './certificate-fonts.service';
import { FontOption } from './certificates.models';
import { familyName } from './font-css';

/**
 * Registra en el navegador las tipografías que se muestran en pantalla (las de la biblioteca y las
 * propias; Helvetica y Times son del sistema). Cada una se carga una sola vez.
 */
@Injectable({ providedIn: 'root' })
export class FontLoader {
  private readonly fonts = inject(CertificateFontsService);
  private readonly pending = new Map<string, Promise<void>>();

  /** Sube cada vez que termina de cargar una: quien mide texto vuelve a medir. */
  readonly version = signal(0);

  /** Carga la normal y, si la tiene, la negrita. Nunca falla: sin tipografía se ve la de respaldo. */
  ensure(option: FontOption | undefined, withBold = true): Promise<void> {
    if (!option?.regularUrl || typeof FontFace === 'undefined' || typeof document === 'undefined') {
      return Promise.resolve();
    }

    const key = `${option.key}|${withBold && option.boldUrl ? 'b' : 'r'}`;
    let loading = this.pending.get(key);

    if (!loading) {
      loading = this.load(option, withBold).catch(() => undefined);
      this.pending.set(key, loading);
    }

    return loading;
  }

  /** Olvida una propia que se borró o se reemplazó. */
  forget(key: string): void {
    for (const cached of [...this.pending.keys()]) {
      if (cached.startsWith(`${key}|`)) {
        this.pending.delete(cached);
      }
    }
  }

  private async load(option: FontOption, withBold: boolean): Promise<void> {
    const family = familyName(option.key);
    const faces: { url: string; weight: '400' | '700' }[] = [
      { url: option.regularUrl as string, weight: '400' },
    ];

    if (withBold && option.boldUrl) {
      faces.push({ url: option.boldUrl, weight: '700' });
    }

    await Promise.all(
      faces.map(async ({ url, weight }) => {
        // Las de la plataforma son públicas y cambian poco: el navegador las pide por su cuenta.
        // Las propias piden sesión: se bajan con ella y se le entregan ya leídas.
        const source: string | ArrayBuffer =
          option.category === 'Mía' ? await firstValueFrom(this.fonts.file(url)) : `url(${url})`;
        const face = new FontFace(family, source, { weight });

        await face.load();
        document.fonts.add(face);
      }),
    );

    this.version.update((value) => value + 1);
  }
}
