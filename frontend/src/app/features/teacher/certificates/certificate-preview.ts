import { Component, computed, effect, ElementRef, inject, input, output } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { CertificateFontsService } from '../../../core/certificates/certificate-fonts.service';
import {
  CertificateLayout,
  CertificateStyle,
  FontOption,
  Offset,
  OffsetPart,
  Offsets,
} from '../../../core/certificates/certificates.models';
import {
  AUTO_BOLD,
  clampOffset,
  NO_OFFSET,
  OFFSET_PARTS,
  resolveText,
} from '../../../core/certificates/certificate-style';
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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

  /** Con true se pueden arrastrar los textos (o moverlos con las flechas del teclado). */
  readonly editable = input(false);
  /** Los desplazamientos nuevos, cuando se arrastra o se usan las flechas. */
  readonly offsetsChange = output<Offsets>();

  readonly offsetParts = OFFSET_PARTS;

  private readonly offsets = computed<Offsets>(() => this.style().offsets ?? {});
  readonly offTitle = computed<Offset>(() => this.offsets().title ?? NO_OFFSET);
  readonly offRecipient = computed<Offset>(() => this.offsets().recipient ?? NO_OFFSET);
  readonly offBody = computed<Offset>(() => this.offsets().body ?? NO_OFFSET);
  readonly offSignature = computed<Offset>(() => this.offsets().signature ?? NO_OFFSET);

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
    const top = this.bodyTop() + this.offBody().y;
    let size = start;

    while (
      size > 9 &&
      top + this.wrappedLines(context, text, width, size, weight, family) * size * 1.32 >
        BODY_LIMIT_Y + this.offSignature().y
    ) {
      size -= 0.5;
    }

    return size;
  });

  /** Alto que ocupa el texto, para el área que se arrastra. */
  readonly bodyHeight = computed(() => {
    this.loader.version();

    const context = this.canvas;
    const text = this.body();

    if (!context || !text) {
      return 60;
    }

    const lines = this.wrappedLines(
      context,
      text,
      this.box().width - this.inset() * 2,
      this.bodySize(),
      this.bodyLook().bold ? 700 : 400,
      this.bodyFamily(),
    );

    return lines * this.bodySize() * 1.32;
  });

  /** Las áreas que se pueden arrastrar, en puntos de página (ya con su desplazamiento). */
  readonly handles = computed<
    { part: OffsetPart; label: string; x: number; y: number; w: number; h: number }[]
  >(() => {
    const b = this.box();
    const t = this.offTitle();
    const r = this.offRecipient();
    const o = this.offBody();
    const s = this.offSignature();

    return [
      {
        part: 'title',
        label: 'Mover el título',
        x: b.x + t.x,
        y: b.titleY + t.y - 4,
        w: b.width,
        h: this.titleSize() * 1.35 + 8,
      },
      {
        part: 'recipient',
        label: 'Mover el nombre y la cédula',
        x: b.x + r.x,
        y: b.contentY + r.y - 4,
        w: b.width,
        h: 108 + this.shift(),
      },
      {
        part: 'body',
        label: 'Mover el texto',
        x: b.x + this.inset() + o.x,
        y: this.bodyTop() + o.y - 4,
        w: b.width - this.inset() * 2,
        h: this.bodyHeight() + 8,
      },
      {
        part: 'signature',
        label: 'Mover la firma',
        x: b.signature.x + s.x,
        y: 462 + s.y - 74,
        w: b.signature.width,
        h: 116,
      },
    ];
  });

  // ---------- Mover con el ratón o el teclado ----------

  private drag: {
    part: OffsetPart;
    pointerX: number;
    pointerY: number;
    start: Offset;
    scale: number;
  } | null = null;

  /** Los puntos de página que vale un píxel de pantalla. */
  private pointsPerPixel(): number {
    const width =
      this.host.nativeElement.querySelector('.cert')?.getBoundingClientRect().width ?? 0;

    return width > 0 ? PAGE_WIDTH / width : 1;
  }

  /**
   * Lo último que se emitió y el padre aún no devolvió. Varias teclas o movimientos seguidos
   * llegan antes de que `style` se actualice, y cada uno debe partir del anterior.
   */
  private pending: Offsets | null = null;

  private current(part: OffsetPart): Offset {
    return (this.pending ?? this.offsets())[part] ?? NO_OFFSET;
  }

  private move(part: OffsetPart, offset: Offset): void {
    this.pending = { ...(this.pending ?? this.offsets()), [part]: clampOffset(offset) };
    this.offsetsChange.emit(this.pending);
  }

  startDrag(part: OffsetPart, event: PointerEvent): void {
    if (!this.editable() || event.button > 0) {
      return;
    }

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.drag = {
      part,
      pointerX: event.clientX,
      pointerY: event.clientY,
      start: this.current(part),
      scale: this.pointsPerPixel(),
    };
    event.preventDefault();
  }

  dragging(event: PointerEvent): void {
    const drag = this.drag;

    if (!drag) {
      return;
    }

    this.move(drag.part, {
      x: drag.start.x + (event.clientX - drag.pointerX) * drag.scale,
      y: drag.start.y + (event.clientY - drag.pointerY) * drag.scale,
    });
  }

  endDrag(): void {
    this.drag = null;
  }

  /** Con las flechas se mueve de a 1 punto; con Mayús, de a 10. */
  nudge(part: OffsetPart, event: KeyboardEvent): void {
    const step = event.shiftKey ? 10 : 1;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[event.key];

    if (!this.editable() || !move) {
      return;
    }

    event.preventDefault();

    const now = this.current(part);

    this.move(part, { x: now.x + move[0], y: now.y + move[1] });
  }

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

    // Cuando el padre ya devolvió los desplazamientos, se parte de ellos otra vez.
    effect(() => {
      this.offsets();
      this.pending = null;
    });

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
