import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  forwardRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Subscription } from 'rxjs';

import {
  countIframes,
  hasVisibleContent,
  isSafeUrl,
  sanitizeHtml,
} from '../../../core/html/html-safe';
import { embedFromInput } from '../../../core/html/video-embed';
import { validateFile } from '../../../core/uploads/upload-rules';
import { UploadsService } from '../../../core/uploads/uploads.service';

type Mode = 'visual' | 'code';
type MediaTab = 'upload' | 'image' | 'video';

interface ToolbarButton {
  id: string;
  title: string;
  /** Orden de document.execCommand. */
  command: string;
  value?: string;
  /** Trazos SVG (viewBox 24×24); si no hay, se usa `glyph`. */
  icon?: string[];
  glyph?: string;
  /** Orden cuyo estado (activo o no) se refleja en el botón. */
  state?: string;
}

const BLOCKS = [
  { value: 'p', label: 'Párrafo' },
  { value: 'h2', label: 'Título 2' },
  { value: 'h3', label: 'Título 3' },
  { value: 'h4', label: 'Título 4' },
  { value: 'pre', label: 'Código' },
];

const TOOLBAR: ToolbarButton[][] = [
  [
    { id: 'bold', title: 'Negrita', command: 'bold', glyph: 'B', state: 'bold' },
    { id: 'italic', title: 'Cursiva', command: 'italic', glyph: 'I', state: 'italic' },
    { id: 'underline', title: 'Subrayado', command: 'underline', glyph: 'U', state: 'underline' },
    {
      id: 'strike',
      title: 'Tachado',
      command: 'strikeThrough',
      glyph: 'S',
      state: 'strikeThrough',
    },
  ],
  [
    {
      id: 'ul',
      title: 'Lista con viñetas',
      command: 'insertUnorderedList',
      glyph: '•',
      state: 'insertUnorderedList',
    },
    {
      id: 'ol',
      title: 'Lista numerada',
      command: 'insertOrderedList',
      glyph: '1.',
      state: 'insertOrderedList',
    },
    { id: 'quote', title: 'Cita', command: 'formatBlock', value: '<blockquote>', glyph: '❝' },
  ],
  [
    {
      id: 'left',
      title: 'Alinear a la izquierda',
      command: 'justifyLeft',
      icon: ['M4 6h16', 'M4 10h10', 'M4 14h16', 'M4 18h10'],
    },
    {
      id: 'center',
      title: 'Centrar',
      command: 'justifyCenter',
      icon: ['M4 6h16', 'M7 10h10', 'M4 14h16', 'M7 18h10'],
    },
    {
      id: 'right',
      title: 'Alinear a la derecha',
      command: 'justifyRight',
      icon: ['M4 6h16', 'M10 10h10', 'M4 14h16', 'M10 18h10'],
    },
  ],
];

const TOOLBAR_END: ToolbarButton[] = [
  { id: 'hr', title: 'Línea horizontal', command: 'insertHorizontalRule', icon: ['M4 12h16'] },
  { id: 'clear', title: 'Quitar formato', command: 'removeFormat', glyph: 'Tx' },
  {
    id: 'undo',
    title: 'Deshacer',
    command: 'undo',
    icon: ['M9 14 4 9l5-5', 'M4 9h11a5 5 0 0 1 0 10h-3'],
  },
  {
    id: 'redo',
    title: 'Rehacer',
    command: 'redo',
    icon: ['m15 14 5-5-5-5', 'M20 9H9a5 5 0 0 0 0 10h3'],
  },
];

const LINK_ICON = [
  'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1',
  'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
];

/** Separa los bloques para que el código se lea mejor en la pestaña «Código». */
function pretty(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|ul|ol|li|blockquote|table|pre|figure)>/gi, '</$1>\n')
    .trim();
}

/**
 * Editor de texto enriquecido: pestaña «Visual» (se escribe y se da formato) y pestaña «Código»
 * (HTML, con iframes). Sirve como campo de formulario: el valor es el HTML. El servidor vuelve
 * a limpiarlo al guardar, así que aquí solo se evita que algo se ejecute en pantalla.
 */
@Component({
  selector: 'app-rich-editor',
  templateUrl: './rich-editor.html',
  styleUrl: './rich-editor.scss',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RichEditor), multi: true },
  ],
})
export class RichEditor implements ControlValueAccessor {
  private readonly uploads = inject(UploadsService);

  readonly inputId = input.required<string>();
  readonly minHeight = input(240);
  readonly placeholder = input('Escribe aquí…');
  /** Nombre del campo para lectores de pantalla (la etiqueta visible no se asocia a un div). */
  readonly label = input('Contenido');

  readonly blocks = BLOCKS;
  readonly toolbar = TOOLBAR;
  readonly toolbarEnd = TOOLBAR_END;
  readonly linkIcon = LINK_ICON;

  readonly mode = signal<Mode>('visual');
  readonly html = signal('');
  readonly disabled = signal(false);
  readonly notice = signal('');

  readonly block = signal('p');
  readonly active = signal<Record<string, boolean>>({});

  readonly empty = computed(() => !hasVisibleContent(this.html()));

  private readonly area = viewChild<ElementRef<HTMLDivElement>>('area');
  private readonly codeBox = viewChild<ElementRef<HTMLTextAreaElement>>('code');

  // Enlace
  readonly linkOpen = signal(false);
  readonly linkUrl = signal('');
  readonly linkError = signal('');

  // Añadir medios
  readonly mediaOpen = signal(false);
  readonly mediaTab = signal<MediaTab>('upload');
  readonly mediaError = signal('');
  readonly mediaAlt = signal('');
  readonly mediaUrl = signal('');
  readonly mediaEmbed = signal('');
  readonly uploading = signal(false);
  readonly percent = signal(0);

  private range: Range | null = null;
  private upload: Subscription | null = null;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    // Al aparecer el área editable (al abrir el editor o volver a «Visual») se carga el contenido.
    effect(() => {
      const element = this.area();

      if (element) {
        untracked(() => (element.nativeElement.innerHTML = sanitizeHtml(this.html())));
      }
    });

    inject(DestroyRef).onDestroy(() => this.upload?.unsubscribe());
  }

  // ---------- ControlValueAccessor ----------

  writeValue(value: string | null): void {
    this.html.set(value ?? '');

    const element = this.area();

    if (element) {
      element.nativeElement.innerHTML = sanitizeHtml(this.html());
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  // ---------- Pestañas ----------

  show(mode: Mode): void {
    if (mode === this.mode()) {
      return;
    }

    this.closePanels();
    this.notice.set('');

    if (mode === 'code') {
      const element = this.area()?.nativeElement;

      if (element) {
        this.html.set(pretty(element.innerHTML));
      }
    } else {
      // Se muestra solo lo permitido; si algo se quitó, se avisa.
      const before = this.html();
      const after = sanitizeHtml(before);

      if (countIframes(before) > countIframes(after)) {
        this.notice.set('Se quitó un video incrustado porque ese sitio no está permitido.');
      } else if (/<script\b/i.test(before)) {
        this.notice.set('Se quitó un <script>: no se permite código que se ejecute.');
      }

      this.html.set(after);
      this.emit(after);
    }

    this.mode.set(mode);
  }

  // ---------- Edición visual ----------

  onInput(): void {
    const element = this.area()?.nativeElement;

    if (!element) {
      return;
    }

    this.html.set(element.innerHTML);
    this.emit(element.innerHTML);
    this.refreshState();
  }

  onCode(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;

    this.html.set(value);
    this.emit(value);
  }

  onBlur(): void {
    this.onTouched();
  }

  /** Al pegar se limpia el HTML (Word y las páginas web traen mucho formato que sobra). */
  onPaste(event: ClipboardEvent): void {
    const html = event.clipboardData?.getData('text/html');

    if (!html) {
      return;
    }

    event.preventDefault();
    document.execCommand('insertHTML', false, sanitizeHtml(html));
    this.onInput();
  }

  run(button: ToolbarButton): void {
    const element = this.area()?.nativeElement;

    if (!element) {
      return;
    }

    element.focus();

    // Solo la alineación se guarda como estilo; el resto usa etiquetas (<b>, <i>…).
    const aligning = button.command.startsWith('justify');

    if (aligning) {
      document.execCommand('styleWithCSS', false, 'true');
    }

    document.execCommand(button.command, false, button.value);

    if (aligning) {
      document.execCommand('styleWithCSS', false, 'false');
    }

    this.onInput();
  }

  setBlock(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    this.run({ id: 'block', title: '', command: 'formatBlock', value: `<${value}>` });
  }

  /** Reflejar en la barra el formato del lugar donde está el cursor. */
  refreshState(): void {
    const element = this.area()?.nativeElement;
    const selection = document.getSelection();

    if (!element || !selection?.anchorNode || !element.contains(selection.anchorNode)) {
      return;
    }

    const block = String(document.queryCommandValue('formatBlock'))
      .toLowerCase()
      .replace(/[<>]/g, '');

    this.block.set(BLOCKS.some((entry) => entry.value === block) ? block : 'p');
    this.active.set(
      Object.fromEntries(
        [
          'bold',
          'italic',
          'underline',
          'strikeThrough',
          'insertUnorderedList',
          'insertOrderedList',
        ].map((command) => [command, document.queryCommandState(command)]),
      ),
    );
  }

  // ---------- Enlace ----------

  openLink(): void {
    this.saveRange();
    this.mediaOpen.set(false);
    this.linkUrl.set('');
    this.linkError.set('');
    this.linkOpen.set(true);
  }

  applyLink(): void {
    const raw = this.linkUrl().trim();
    const url = /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('/') ? raw : `https://${raw}`;

    if (!raw || !isSafeUrl(url)) {
      this.linkError.set('Escribe una dirección válida, por ejemplo https://ejemplo.com');
      return;
    }

    this.restoreRange();
    document.execCommand('createLink', false, url);
    this.linkOpen.set(false);
    this.onInput();
  }

  // ---------- Añadir medios ----------

  openMedia(): void {
    this.saveRange();
    this.linkOpen.set(false);
    this.mediaError.set('');
    this.mediaAlt.set('');
    this.mediaUrl.set('');
    this.mediaEmbed.set('');
    this.mediaTab.set('upload');
    this.mediaOpen.set(true);
  }

  closePanels(): void {
    this.mediaOpen.set(false);
    this.linkOpen.set(false);
    this.upload?.unsubscribe();
    this.uploading.set(false);
  }

  setField(field: 'mediaAlt' | 'mediaUrl' | 'mediaEmbed' | 'linkUrl', event: Event): void {
    this[field].set((event.target as HTMLInputElement | HTMLTextAreaElement).value);
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (!file) {
      return;
    }

    const problem = validateFile('image', file);

    if (problem) {
      this.mediaError.set(problem);
      return;
    }

    this.mediaError.set('');
    this.uploading.set(true);
    this.percent.set(0);

    this.upload?.unsubscribe();
    this.upload = this.uploads.upload('image', file).subscribe({
      next: (progress) => {
        if (progress.type === 'progress') {
          this.percent.set(progress.percent);
          return;
        }

        this.uploading.set(false);
        this.insertImage(progress.url);
      },
      error: (error: Error) => {
        this.mediaError.set(error.message);
        this.uploading.set(false);
      },
    });
  }

  addImageByUrl(): void {
    const url = this.mediaUrl().trim();

    if (!/^https?:\/\//i.test(url) || !isSafeUrl(url, ['http:', 'https:'])) {
      this.mediaError.set('Escribe la dirección completa de la imagen, empezando con https://');
      return;
    }

    this.insertImage(url);
  }

  addEmbed(): void {
    const result = embedFromInput(this.mediaEmbed());

    if ('error' in result) {
      this.mediaError.set(result.error);
      return;
    }

    // Un párrafo vacío después, para poder seguir escribiendo.
    this.insert(`${result.html}<p><br></p>`);
  }

  private insertImage(url: string): void {
    const alt = this.mediaAlt().trim().replace(/"/g, '&quot;').replace(/</g, '&lt;');

    this.insert(`<img src="${url}" alt="${alt}">`);
  }

  /** Inserta HTML donde estaba el cursor (o al final, si no hay). */
  private insert(html: string): void {
    this.mediaOpen.set(false);
    this.mediaError.set('');

    if (this.mode() === 'code') {
      const box = this.codeBox()?.nativeElement;
      const text = this.html();
      const start = box?.selectionStart ?? text.length;
      const end = box?.selectionEnd ?? text.length;
      const next = `${text.slice(0, start)}\n${html}\n${text.slice(end)}`;

      this.html.set(next);
      this.emit(next);
      return;
    }

    const element = this.area()?.nativeElement;

    if (!element) {
      return;
    }

    this.restoreRange();

    if (!document.execCommand('insertHTML', false, sanitizeHtml(html))) {
      element.insertAdjacentHTML('beforeend', sanitizeHtml(html));
    }

    this.onInput();
  }

  // ---------- Selección ----------

  private saveRange(): void {
    const element = this.area()?.nativeElement;
    const selection = document.getSelection();

    this.range =
      element && selection?.rangeCount && element.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;
  }

  private restoreRange(): void {
    const element = this.area()?.nativeElement;

    element?.focus();

    if (this.range) {
      const selection = document.getSelection();

      selection?.removeAllRanges();
      selection?.addRange(this.range);
    }
  }

  private emit(html: string): void {
    // Sin nada visible, el campo queda vacío (así «obligatorio» funciona).
    this.onChange(hasVisibleContent(html) ? html : '');
  }
}
