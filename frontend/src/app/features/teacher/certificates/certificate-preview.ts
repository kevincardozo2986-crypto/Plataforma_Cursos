import { Component, computed, effect, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { CertificateFontsService } from '../../../core/certificates/certificate-fonts.service';
import { FontOption, CertificateLayout } from '../../../core/certificates/certificates.models';
import { cssFamily, cssWeight, fitToWidth } from '../../../core/certificates/font-css';
import { FontLoader } from '../../../core/certificates/font-loader';
import { certificateArt, fitSize, PAGE_HEIGHT, PAGE_WIDTH, textBox } from './certificate-art';

/** Helvetica y Times se conocen sin pedir el catálogo; las demás aparecen cuando este carga. */
const STANDARD: Record<string, FontOption> = {
  SANS: { key: 'SANS', label: 'Helvetica', category: 'Sans', hasBold: true },
  SERIF: { key: 'SERIF', label: 'Times', category: 'Serif', hasBold: true },
};

/**
 * Un certificado dibujado en pantalla con la misma geometría que el PDF. Se escala solo: todo
 * está en proporción al ancho del contenedor, así que sirve igual como vista previa grande o
 * como miniatura.
 */
@Component({
  selector: 'app-certificate-preview',
  templateUrl: './certificate-preview.html',
  styleUrl: './certificate-preview.scss',
})
export class CertificatePreview {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly fonts = inject(CertificateFontsService);
  private readonly loader = inject(FontLoader);

  readonly layout = input.required<CertificateLayout>();
  readonly color = input('#1F3A8A');
  /** Tipografía de título y nombre. */
  readonly font = input('SANS');
  /** Tipografía del texto. */
  readonly bodyFont = input('SANS');
  readonly title = input('');
  /** El texto ya con los datos de ejemplo puestos. */
  readonly body = input('');
  readonly student = input('Nombre del Estudiante');
  /** Ya formateado (con puntos de miles); vacío = no se dibuja. */
  readonly document = input('');
  readonly instructor = input('Docente');
  readonly code = input('CC-XXXX-XXXX-XXXX');

  /** Las posiciones del texto, en puntos de página. */
  readonly box = computed(() => textBox(this.layout(), this.color()));

  /** El dibujo lo genera certificateArt a partir de un color validado: no hay nada de usuario en él. */
  readonly art = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(certificateArt(this.layout(), this.color())),
  );

  // ---------- Tipografías ----------

  private readonly headingOption = computed(
    () => this.fonts.find(this.font()) ?? STANDARD[this.font()] ?? STANDARD['SANS'],
  );
  private readonly bodyOption = computed(
    () => this.fonts.find(this.bodyFont()) ?? STANDARD[this.bodyFont()] ?? STANDARD['SANS'],
  );

  readonly headingFamily = computed(() => cssFamily(this.headingOption()));
  readonly headingWeight = computed(() => cssWeight(this.headingOption(), true));
  readonly bodyFamily = computed(() => cssFamily(this.bodyOption()));

  private readonly canvas =
    typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');

  readonly titleText = computed(() =>
    this.box().upper ? this.title().toUpperCase() : this.title(),
  );
  readonly titleSize = computed(() =>
    this.fit(this.titleText(), this.box().titleSize, this.box().width, 16),
  );
  readonly nameSize = computed(() => this.fit(this.student(), 42, this.box().width, 18));

  readonly bodyTop = computed(() => this.box().contentY + (this.box().rule === 'none' ? 104 : 124));
  readonly inset = computed(() => (this.box().align === 'center' ? 20 : 0));
  readonly ruleLeft = computed(() =>
    this.box().rule === 'center' ? PAGE_WIDTH / 2 - 130 : this.box().x,
  );

  /** De puntos de página a porcentaje del ancho o del alto. */
  readonly x = (points: number): number => (points / PAGE_WIDTH) * 100;
  readonly y = (points: number): number => (points / PAGE_HEIGHT) * 100;
  /** De puntos a unidades del contenedor (cqw): el texto se escala con el certificado. */
  readonly size = (points: number): number => (points / PAGE_WIDTH) * 100;

  constructor() {
    this.fonts.load();

    // Al elegir otra tipografía se carga en el navegador.
    effect(() => {
      void this.loader.ensure(this.headingOption());
      void this.loader.ensure(this.bodyOption(), false);
    });
  }

  /**
   * El tamaño que cabe, medido con la tipografía real (como hace el PDF). Sin canvas, o mientras
   * la tipografía carga, una aproximación; al terminar de cargar se vuelve a calcular.
   */
  private fit(text: string, start: number, maxWidth: number, min: number): number {
    // Depender de la versión hace que se recalcule cuando termina de cargar una tipografía.
    this.loader.version();

    const context = this.canvas;

    if (!context || !text) {
      return fitSize(text, start, maxWidth, min);
    }

    const family = this.headingFamily();
    const weight = this.headingWeight();

    return fitToWidth(start, maxWidth, min, (size) => {
      context.font = `${weight} ${size}px ${family}`;

      return context.measureText(text).width;
    });
  }
}
