import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

import { CertificateFontsService } from '../../../core/certificates/certificate-fonts.service';
import {
  DEFAULT_FONT,
  FontCategory,
  FontOption,
} from '../../../core/certificates/certificates.models';
import { cssFamily, fontFileProblem } from '../../../core/certificates/font-css';
import { FontLoader } from '../../../core/certificates/font-loader';
import { apiErrorMessage } from '../../../core/http/api-error';

const GROUPS: { category: FontCategory; title: string }[] = [
  { category: 'Mía', title: 'Mis tipografías' },
  { category: 'Sans', title: 'Sans (sin adornos)' },
  { category: 'Serif', title: 'Serif (con remates)' },
  { category: 'Cursiva', title: 'Cursivas' },
  { category: 'Título', title: 'Para títulos' },
];

/**
 * Lista desplegable de tipografías: cada nombre se ve con su propia letra, agrupadas por estilo.
 * Permite subir una tipografía propia (que queda disponible solo para quien la subió).
 */
@Component({
  selector: 'app-font-picker',
  templateUrl: './font-picker.html',
  styleUrl: './font-picker.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
  },
})
export class FontPicker {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly fonts = inject(CertificateFontsService);
  private readonly loader = inject(FontLoader);

  /** La clave elegida: "SANS", "lora", "custom:3"… */
  readonly value = model.required<string>();
  readonly label = input.required<string>();
  readonly inputId = input.required<string>();

  readonly open = signal(false);
  readonly uploading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  /** Id de la propia que está pidiendo confirmación para borrarse. */
  readonly confirmDeleteId = signal<number | null>(null);

  readonly current = computed<FontOption>(() => {
    const key = this.value();
    const known = this.fonts.find(key);

    if (known) {
      return known;
    }

    // Helvetica y Times se conocen sin el catálogo; de las demás, hasta que cargue, no se sabe el nombre.
    if (key === 'SANS' || key === 'SERIF') {
      return { key, label: key === 'SANS' ? 'Helvetica' : 'Times', category: key === 'SANS' ? 'Sans' : 'Serif', hasBold: true };
    }

    return {
      key,
      label: this.fonts.loaded() ? 'Tipografía no disponible (se usa Helvetica)' : 'Cargando…',
      category: 'Sans',
      hasBold: true,
    };
  });

  readonly groups = computed(() =>
    GROUPS.map((group) => ({
      ...group,
      items: this.fonts.options().filter((option) => option.category === group.category),
    })).filter((group) => group.items.length > 0),
  );

  readonly family = (option: FontOption): string => cssFamily(option);

  constructor() {
    this.fonts.load();

    // La elegida se ve con su letra apenas carga el catálogo.
    effect(() => void this.loader.ensure(this.current(), false));
  }

  toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }

    this.open.set(true);
    this.error.set('');
    this.notice.set('');

    // Para que cada nombre se vea con su letra, se cargan todas (pesan unos 25 KB cada una).
    for (const option of this.fonts.options()) {
      void this.loader.ensure(option, false);
    }
  }

  close(): void {
    this.open.set(false);
    this.confirmDeleteId.set(null);
  }

  select(option: FontOption): void {
    this.value.set(option.key);
    this.close();
  }

  /** Flechas arriba y abajo recorren las opciones; Inicio y Fin van a los extremos. */
  onKey(event: KeyboardEvent): void {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

    if (!keys.includes(event.key)) {
      return;
    }

    const buttons = [...this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.option')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : Math.min(buttons.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)));

    buttons[next]?.focus();
    event.preventDefault();
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (!file) {
      return;
    }

    const problem = fontFileProblem(file);

    if (problem) {
      this.error.set(problem);
      return;
    }

    this.error.set('');
    this.notice.set('');
    this.uploading.set(true);

    this.fonts.upload(file).subscribe({
      next: (created) => {
        this.uploading.set(false);
        this.notice.set(`«${created.label}» quedó disponible.`);
        // Se elige de una vez: es lo que casi siempre se quiere al subirla.
        this.value.set(created.key);
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.error.set(apiErrorMessage(error, 'No pudimos subir la tipografía.'));
      },
    });
  }

  askDelete(option: FontOption): void {
    this.confirmDeleteId.set(option.id ?? null);
    this.error.set('');
  }

  remove(option: FontOption): void {
    if (option.id === undefined) {
      return;
    }

    this.fonts.remove(option.id).subscribe({
      next: () => {
        this.loader.forget(option.key);
        this.confirmDeleteId.set(null);
        this.notice.set(`Se borró «${option.label}».`);

        if (this.value() === option.key) {
          this.value.set(DEFAULT_FONT);
        }
      },
      error: (error: unknown) => {
        this.confirmDeleteId.set(null);
        // El servidor explica si una plantilla o un certificado todavía la usan.
        this.error.set(apiErrorMessage(error, 'No pudimos borrar la tipografía.'));
      },
    });
  }

  /**
   * Un clic fuera cierra el menú. Se mira el camino del evento (calculado al disparar), no el
   * elemento: si el botón pulsado se reemplaza al instante por otro, ya no estaría dentro y
   * el menú se cerraría solo.
   */
  onDocumentClick(event: Event): void {
    if (this.open() && !event.composedPath().includes(this.host.nativeElement)) {
      this.close();
    }
  }
}
