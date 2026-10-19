import { inject, Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { sanitizeHtml } from '../../core/html/html-safe';

/**
 * Muestra el HTML del editor enriquecido, con sus videos incrustados y su alineación.
 * El sanitizador de Angular quitaría los <iframe> y los estilos, así que el HTML se limpia
 * antes con el mismo criterio que usa el servidor (solo etiquetas, atributos y sitios
 * permitidos) y recién entonces se marca como confiable.
 *
 * Uso: `<div class="rich-content" [innerHTML]="texto | richHtml"></div>`
 */
@Pipe({ name: 'richHtml' })
export class RichHtmlPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(html: string | null | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(sanitizeHtml(html ?? ''));
  }
}
