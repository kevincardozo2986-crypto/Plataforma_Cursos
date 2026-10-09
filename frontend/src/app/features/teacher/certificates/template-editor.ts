import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map, startWith } from 'rxjs';

import {
  CertificateLayout,
  CertificateTemplate,
  DEFAULT_BODY,
  DEFAULT_COLOR,
  DEFAULT_TITLE,
  LAYOUT_LABELS,
  LAYOUTS,
  PLACEHOLDERS,
} from '../../../core/certificates/certificates.models';
import { CertificatesService } from '../../../core/certificates/certificates.service';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { openBlob } from '../../../core/utils/download';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { fillSample, HEX_COLOR, sampleValues, unknownPlaceholders } from './certificate-text';

/** Crear o editar una plantilla de certificado, con una vista previa que se actualiza al escribir. */
@Component({
  selector: 'app-template-editor',
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './template-editor.html',
  styleUrl: './template-editor.scss',
})
export class TemplateEditor {
  private readonly api = inject(CertificatesService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** Sin id = plantilla nueva. */
  readonly id: number | null = Number(inject(ActivatedRoute).snapshot.paramMap.get('id')) || null;

  readonly layouts = LAYOUTS;
  readonly layoutLabels = LAYOUT_LABELS;
  readonly placeholders = PLACEHOLDERS;

  readonly loading = signal(this.id !== null);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

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
    const { title, body, accentColor, layout } = this.value();
    const values = sampleValues(this.instructor());

    return {
      title,
      body: fillSample(body, values),
      student: values['student'],
      instructor: values['instructor'],
      // Un color a medio escribir no debe romper la vista previa.
      color: HEX_COLOR.test(accentColor) ? accentColor : DEFAULT_COLOR,
      layout,
    };
  });

  readonly unknown = computed(() => unknownPlaceholders(this.value().body));

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

    this.saving.set(true);

    const input = this.form.getRawValue();
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
    this.form.reset({
      name: template.name,
      title: template.title,
      body: template.body,
      accentColor: template.accentColor,
      layout: template.layout,
    });
  }
}
