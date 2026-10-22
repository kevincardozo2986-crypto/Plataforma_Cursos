import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map, startWith, Subscription } from 'rxjs';

import {
  CertificateLayout,
  CertificateStyle,
  CertificateTemplate,
  Offset,
  OffsetPart,
  Offsets,
  TextStyle,
  DEFAULT_BODY,
  DEFAULT_COLOR,
  DEFAULT_TITLE,
  LAYOUT_LABELS,
  LAYOUTS,
  PLACEHOLDERS,
} from '../../../core/certificates/certificates.models';
import {
  cleanStyle,
  clampOffset,
  NO_OFFSET,
  OFFSET_MAX_X,
  OFFSET_MAX_Y,
  OFFSET_PARTS,
  StyledPart,
} from '../../../core/certificates/certificate-style';
import { CertificatesService } from '../../../core/certificates/certificates.service';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { openBlob } from '../../../core/utils/download';
import { Icon } from '../../../shared/ui/icon/icon';
import { validateFile } from '../../../core/uploads/upload-rules';
import { UploadsService } from '../../../core/uploads/uploads.service';
import { CertificatePreview } from './certificate-preview';
import { FontPicker } from './font-picker';
import { fillSample, HEX_COLOR, sampleValues, unknownPlaceholders } from './certificate-text';

/** Crear o editar una plantilla de certificado, con una vista previa que se actualiza al escribir. */
@Component({
  selector: 'app-template-editor',
  imports: [ReactiveFormsModule, RouterLink, Icon, CertificatePreview, FontPicker],
  templateUrl: './template-editor.html',
  styleUrl: './template-editor.scss',
})
export class TemplateEditor {
  private readonly api = inject(CertificatesService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly uploads = inject(UploadsService);
  private upload: Subscription | null = null;

  /** Sin id = plantilla nueva. */
  readonly id: number | null = Number(inject(ActivatedRoute).snapshot.paramMap.get('id')) || null;

  readonly layouts = LAYOUTS;
  readonly layoutLabels = LAYOUT_LABELS;
  readonly placeholders = PLACEHOLDERS;

  readonly loading = signal(this.id !== null);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  /** Qué textos se pueden estilizar, y cuál es su negrita "automática". */
  readonly parts: { key: StyledPart; label: string; autoBold: boolean }[] = [
    { key: 'title', label: 'Título', autoBold: true },
    { key: 'name', label: 'Nombre del estudiante', autoBold: true },
    { key: 'body', label: 'Texto', autoBold: false },
  ];

  // Imagen de fondo propia (diseño «Mi imagen»)
  readonly backgroundUrl = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly percent = signal(0);
  readonly backgroundError = signal('');

  /** Negrita, cursiva, tamaño y color de cada texto. */
  readonly style = signal<CertificateStyle>({});

  readonly bodyBox = viewChild<ElementRef<HTMLTextAreaElement>>('bodyBox');

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(100)],
    }),
    title: new FormControl(DEFAULT_TITLE, {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    }),
    body: new FormControl(DEFAULT_BODY, {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(10), Validators.maxLength(600)],
    }),
    accentColor: new FormControl(DEFAULT_COLOR, {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(HEX_COLOR)],
    }),
    layout: new FormControl<CertificateLayout>('CLASSIC', { nonNullable: true }),
    /** Tipografía de título y nombre. */
    font: new FormControl('SANS', { nonNullable: true }),
    /** Tipografía del texto. */
    bodyFont: new FormControl('SANS', { nonNullable: true }),
  });

  private readonly value = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  /** Nombre que sale como docente en la vista previa. */
  private readonly instructor = computed(() => {
    const user = this.auth.user();

    return user ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'Docente';
  });

  readonly preview = computed(() => {
    const { title, body, accentColor, layout, font, bodyFont } = this.value();
    const values = sampleValues(this.instructor());

    return {
      title,
      body: fillSample(body, values),
      student: values['student'],
      document: '1.234.567.890',
      instructor: values['instructor'],
      // Un color a medio escribir no debe romper la vista previa.
      color: HEX_COLOR.test(accentColor) ? accentColor : DEFAULT_COLOR,
      layout,
      font,
      bodyFont,
      style: this.style(),
      background: this.backgroundUrl(),
    };
  });

  readonly isImage = computed(() => this.value().layout === 'IMAGE');

  readonly unknown = computed(() => unknownPlaceholders(this.value().body));

  /** El nombre del curso solo sale si el texto lo incluye con {{course}}. */
  readonly missingCourse = computed(() => !/\{\{\s*course\s*\}\}/.test(this.value().body));

  constructor() {
    if (this.id !== null) {
      this.api
        .template(this.id)
        .pipe(takeUntilDestroyed())
        .subscribe({
          next: (template) => {
            this.fill(template);
            this.loading.set(false);
          },
          error: (error: unknown) => {
            this.error.set(apiErrorMessage(error, 'No pudimos cargar la plantilla.'));
            this.loading.set(false);
          },
        });
    }
  }

  text(part: StyledPart): TextStyle {
    return this.style()[part] ?? {};
  }

  /** Cambia una propiedad de un texto. `undefined` la devuelve al valor del diseño. */
  setText<K extends keyof TextStyle>(
    part: StyledPart,
    key: K,
    value: TextStyle[K] | undefined,
  ): void {
    this.style.update((style) => ({ ...style, [part]: { ...style[part], [key]: value } }));
    this.form.markAsDirty();
  }

  setBold(part: StyledPart, value: string): void {
    this.setText(part, 'bold', value === 'auto' ? undefined : value === 'yes');
  }

  boldValue(part: StyledPart): string {
    const bold = this.text(part).bold;

    return bold === undefined ? 'auto' : bold ? 'yes' : 'no';
  }

  /** Sube la imagen de fondo y la deja puesta en la plantilla (se guarda con «Guardar»). */
  onBackground(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (!file) {
      return;
    }

    const problem = validateFile('image', file);

    if (problem) {
      this.backgroundError.set(problem);
      return;
    }

    this.backgroundError.set('');
    this.uploading.set(true);
    this.percent.set(0);

    this.upload?.unsubscribe();
    this.upload = this.uploads.upload('image', file).subscribe({
      next: (event) => {
        if (event.type === 'progress') {
          this.percent.set(event.percent);
          return;
        }

        this.backgroundUrl.set(event.url);
        this.uploading.set(false);
        this.form.markAsDirty();
      },
      error: (error: Error) => {
        this.backgroundError.set(error.message);
        this.uploading.set(false);
      },
    });
  }

  removeBackground(): void {
    this.backgroundUrl.set(null);
    this.form.markAsDirty();
  }

  setVeil(value: number): void {
    this.style.update((style) => ({ ...style, veil: value > 0 ? value : undefined }));
    this.form.markAsDirty();
  }

  // ---------- Posición de los textos ----------

  readonly offsetParts = OFFSET_PARTS;
  readonly offsetMaxX = OFFSET_MAX_X;
  readonly offsetMaxY = OFFSET_MAX_Y;

  offsetOf(part: OffsetPart): Offset {
    return this.style().offsets?.[part] ?? NO_OFFSET;
  }

  /** Los desplazamientos que llegan de arrastrar los textos en la vista previa. */
  setOffsets(offsets: Offsets): void {
    this.style.update((style) => ({ ...style, offsets }));
    this.form.markAsDirty();
  }

  setOffset(part: OffsetPart, axis: 'x' | 'y', value: string): void {
    const now = this.offsetOf(part);
    const number = Number(value);

    this.setOffsets({
      ...(this.style().offsets ?? {}),
      [part]: clampOffset({ ...now, [axis]: Number.isFinite(number) ? number : 0 }),
    });
  }

  resetOffset(part: OffsetPart): void {
    const { [part]: _removed, ...rest } = this.style().offsets ?? {};

    this.setOffsets(rest);
  }

  resetOffsets(): void {
    this.setOffsets({});
  }

  readonly hasOffsets = computed(
    () => Object.values(cleanStyle(this.style()).offsets ?? {}).length > 0,
  );

  setShowDocument(show: boolean): void {
    this.style.update((style) => ({ ...style, showDocument: show ? undefined : false }));
    this.form.markAsDirty();
  }

  resetStyle(): void {
    this.style.set({});
    this.form.markAsDirty();
  }

  readonly hasStyle = computed(() => Object.keys(cleanStyle(this.style())).length > 0);

  /** Inserta un marcador donde está el cursor del texto. */
  insert(token: string): void {
    const control = this.form.controls.body;
    const box = this.bodyBox()?.nativeElement;
    const text = control.value;
    const start = box?.selectionStart ?? text.length;
    const end = box?.selectionEnd ?? text.length;

    control.setValue(text.slice(0, start) + token + text.slice(end));
    control.markAsDirty();

    queueMicrotask(() => {
      box?.focus();
      box?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  save(): void {
    this.persist((saved) => {
      this.notice.set('Plantilla guardada.');

      if (this.id === null) {
        // Pasa a modo edición para que "Ver PDF" y los siguientes guardados usen su id.
        void this.router.navigate(['/teacher/certificates', saved.id], { replaceUrl: true });
      }
    });
  }

  /** El PDF real se genera en el servidor a partir de lo guardado, así que primero se guarda. */
  openPdf(): void {
    this.persist((saved) => {
      this.api.preview(saved.id).subscribe({
        next: (blob) => {
          openBlob(blob);
          this.notice.set('Plantilla guardada y PDF generado.');
        },
        error: (error: unknown) =>
          this.error.set(apiErrorMessage(error, 'No pudimos generar la vista previa.')),
      });

      if (this.id === null) {
        void this.router.navigate(['/teacher/certificates', saved.id], { replaceUrl: true });
      }
    });
  }

  private persist(done: (saved: CertificateTemplate) => void): void {
    this.error.set('');
    this.notice.set('');

    if (this.form.invalid || this.unknown().length > 0) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isImage() && !this.backgroundUrl()) {
      this.backgroundError.set('Sube la imagen de fondo para usar este diseño.');
      return;
    }

    this.saving.set(true);

    const input = {
      ...this.form.getRawValue(),
      style: cleanStyle(this.style()),
      backgroundUrl: this.isImage() ? this.backgroundUrl() : null,
    };
    const request =
      this.id === null ? this.api.createTemplate(input) : this.api.updateTemplate(this.id, input);

    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.form.markAsPristine();
        done(saved);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos guardar la plantilla.'));
        this.saving.set(false);
      },
    });
  }

  private fill(template: CertificateTemplate): void {
    this.style.set(template.style ?? {});
    this.backgroundUrl.set(template.backgroundUrl ?? null);
    this.form.reset({
      name: template.name,
      title: template.title,
      body: template.body,
      accentColor: template.accentColor,
      layout: template.layout,
      font: template.font ?? 'SANS',
      bodyFont: template.bodyFont ?? template.font ?? 'SANS',
    });
  }
}
