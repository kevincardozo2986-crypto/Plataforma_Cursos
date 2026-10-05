import { Component, computed, effect, inject, input, OnDestroy, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith, Subscription, switchMap } from 'rxjs';

import {
  ACCEPT,
  formatSize,
  isPlayableVideoUrl,
  UploadKind,
  validateFile,
} from '../../../core/uploads/upload-rules';
import { UploadsService } from '../../../core/uploads/uploads.service';

/**
 * Campo para una imagen o un video: se pega un enlace o se sube un archivo del
 * computador, y debajo se ve una vista previa. Trabaja sobre el FormControl del
 * formulario que lo usa, así que ese formulario sigue siendo el dueño del valor.
 */
@Component({
  selector: 'app-media-field',
  imports: [ReactiveFormsModule],
  templateUrl: './media-field.html',
  styleUrl: './media-field.scss',
})
export class MediaField implements OnDestroy {
  private readonly uploads = inject(UploadsService);

  readonly control = input.required<FormControl<string>>();
  readonly kind = input.required<UploadKind>();
  readonly label = input.required<string>();
  readonly inputId = input.required<string>();
  readonly placeholder = input('https://…');
  readonly hint = input('');
  /** Error de validación del formulario padre (por ejemplo, URL mal escrita). */
  readonly error = input('');

  readonly accept = computed(() => ACCEPT[this.kind()]);

  readonly uploading = signal(false);
  readonly percent = signal(0);
  readonly fileName = signal('');
  readonly uploadError = signal('');
  readonly uploaded = signal<{ name: string; size: string } | null>(null);

  /** La vista previa no pudo cargarse (enlace roto, no es una imagen, formato no reproducible…). */
  readonly previewFailed = signal(false);

  /** Valor actual del campo, siguiendo al FormControl. */
  private readonly value = toSignal(
    toObservable(this.control).pipe(
      switchMap((control) => control.valueChanges.pipe(startWith(control.value))),
    ),
    { initialValue: '' },
  );

  /** Lo que se intenta previsualizar: solo si hay un valor y el formulario no lo marca como inválido. */
  readonly previewUrl = computed(() => {
    const url = (this.value() ?? '').trim();

    return url && !this.error() ? url : '';
  });

  /** `#t=0.1` hace que el navegador muestre un fotograma en vez de un cuadro negro antes de dar play. */
  readonly videoSrc = computed(() => {
    const url = this.previewUrl();

    return url.includes('#') ? url : `${url}#t=0.1`;
  });

  readonly showImage = computed(() => this.kind() === 'image' && !!this.previewUrl());
  readonly showVideo = computed(() => this.kind() === 'video' && isPlayableVideoUrl(this.previewUrl()));

  private subscription: Subscription | null = null;

  constructor() {
    // Si cambia el enlace, se vuelve a intentar la vista previa.
    effect(() => {
      this.value();
      untracked(() => this.previewFailed.set(false));
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    // Permite volver a elegir el mismo archivo más tarde.
    input.value = '';

    if (!file) {
      return;
    }

    this.uploadError.set('');
    this.uploaded.set(null);

    const problem = validateFile(this.kind(), file);

    if (problem) {
      this.uploadError.set(problem);
      return;
    }

    this.start(file);
  }

  cancel(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.uploading.set(false);
  }

  clear(): void {
    const control = this.control();

    control.setValue('');
    control.markAsDirty();
    this.uploaded.set(null);
    this.uploadError.set('');
  }

  private start(file: File): void {
    this.fileName.set(file.name);
    this.percent.set(0);
    this.uploading.set(true);

    this.subscription = this.uploads.upload(this.kind(), file).subscribe({
      next: (event) => {
        if (event.type === 'progress') {
          this.percent.set(event.percent);
          return;
        }

        const control = this.control();

        control.setValue(event.url);
        control.markAsDirty();
        control.markAsTouched();
        this.uploaded.set({ name: event.name, size: formatSize(event.size) });
        this.uploading.set(false);
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.uploadError.set(error instanceof Error ? error.message : 'No pudimos subir el archivo.');
      },
    });
  }
}
