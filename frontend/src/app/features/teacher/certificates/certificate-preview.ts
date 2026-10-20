import { Component, computed, effect, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { CertificateFontsService } from '../../../core/certificates/certificate-fonts.service';
import {
  CertificateLayout,
  CertificateStyle,
  FontOption,
} from '../../../core/certificates/certificates.models';
import { AUTO_BOLD, resolveText } from '../../../core/certificates/certificate-style';
import { cssFamily, fitToWidth } from '../../../core/certificates/font-css';
import { FontLoader } from '../../../core/certificates/font-loader';
import { certificateArt, fitSize, PAGE_HEIGHT, PAGE_WIDTH, textBox } from './certificate-art';

/** Debajo de esta altura (puntos de página) están la firma y su línea. */
const BODY_LIMIT_Y = 462 - 82;

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
  /** Negrita, cursiva, tamaño y color de cada texto. */
  readonly style = input<CertificateStyle>({});
  /** Imagen de fondo propia (solo con el diseño IMAGE). */
  readonly background = input<string | null>(null);

  protected readonly PAGE_W = PAGE_WIDTH;
  protected readonly PAGE_H = PAGE_HEIGHT;

  /** Las posiciones del texto, en puntos de página. */
  readonly box = computed(() => textBox(this.layout(), this.color()));

  /** El dibujo lo genera certificateArt a partir de un color validado: no hay nada de usuario en él. */
  readonly art = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(certificateArt(this.layout(), this.color())),
  );

  /** Solo una imagen ya subida a la plataforma; cualquier otra cosa no se pinta. */
  readonly backgroundCss = computed(() => {
    const url = this.background();

    return this.layout() === 'IMAGE' && url && /^\/api\/uploads\/[a-f0-9]{32}\.\w+$/.test(url)
      ? `url("${url}")`
      : null;
  });

  readonly veil = computed(() => (this.layout() === 'IMAGE' ? (this.style().veil ?? 0) / 100 : 0));

  // ---------- Tipografías ----------

  private readonly headingOption = computed(
    () => this.fonts.find(this.font()) ?? STANDARD[this.font()] ?? STANDARD['SANS'],
  );
  private readonly bodyOption = computed(
    () => this.fonts.find(this.bodyFont()) ?? STANDARD[this.bodyFont()] ?? STANDARD['SANS'],
  );

  readonly headingFamily = computed(() => cssFamily(this.headingOption()));
  readonly bodyFamily = computed(() => cssFamily(this.bodyOption()));

  // ---------- Estilo de cada texto ----------

  readonly titleLook = computed(() =>
    resolveText(this.style().title, AUTO_BOLD.title, this.headingOption()),
  );
  readonly nameLook = computed(() =>
    resolveText(this.style().name, AUTO_BOLD.name, this.headingOption()),
  );
  readonly bodyLook = computed(() =>
    resolveText(this.style().body, AUTO_BOLD.body, this.bodyOption()),
  );
  /** La firma lleva la tipografía del nombre, con su misma negrita. */
  readonly signWeight = computed(() => (this.nameLook().bold ? 700 : 400));
  readonly showDocument = computed(() => this.style().showDocument !== false);

  private readonly canvas =
    typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');

  readonly titleText = computed(() =>
    this.box().upper ? this.title().toUpperCase() : this.title(),
  );
  readonly titleSize = computed(() =>
    this.fit(this.titleText(), this.box().titleSize * this.titleLook().scale, this.box().width, 16),
  );
  readonly nameSize = computed(() =>
    this.fit(this.student(), 42 * this.nameLook().scale, this.box().width, 18),
  );

  /** Un nombre grande empuja hacia abajo la cédula, la línea y el texto (como en el PDF). */
  readonly shift = computed(() => Math.max(0, this.nameSize() * 1.18 - 50));

  readonly bodyTop = computed(
    () => this.box().contentY + (this.box().rule === 'none' ? 104 : 124) + this.shift(),
  );

  /** El texto se achica hasta quedar por encima de la firma, como en el PDF. */
  readonly bodySize = computed(() => {
    this.loader.version();

    const context = this.canvas;
    const text = this.body();
    const start = 16 * this.bodyLook().scale;
    const width = this.box().width - this.inset() * 2;

    if (!context || !text) {
      return start;
    }

    const family = this.bodyFamily();
    const weight = this.bodyLook().bold ? 700 : 400;
    const top = this.bodyTop();
    let size = start;

    while (
      size > 9 &&
      top + this.wrappedLines(context, text, width, size, weight, family) * size * 1.32 >
        BODY_LIMIT_Y
    ) {
      size -= 0.5;
    }

    return size;
  });

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

  private wrappedLines(
    context: CanvasRenderingContext2D,
    text: string,
    width: number,
    size: number,
    weight: number,
    family: string,
  ): number {
    context.font = `${weight} ${size}px ${family}`;

    let lines = 1;
    let line = '';

    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;

      if (line && context.measureText(next).width > width) {
        lines += 1;
        line = word;
      } else {
        line = next;
      }
    }

    return lines;
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
    const weight = this.nameLook().bold ? 700 : 400;

    return fitToWidth(start, maxWidth, min, (size) => {
      context.font = `${weight} ${size}px ${family}`;

      return context.measureText(text).width;
    });
  }
}
