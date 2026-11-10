import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { PublicUrlPipe } from '../../../../core/http/public-url.pipe';
import { Component, inject, input, linkedSignal, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { apiErrorMessage } from '../../../../core/http/api-error';
import { UploadsService } from '../../../../core/uploads/uploads.service';
import {
  RESOURCE_ACCEPT,
  formatSize,
  resourceFileKind,
  resourceTypeOf,
  validateResourceFile,
} from '../../../../core/uploads/upload-rules';
import { RESOURCE_LABELS, RESOURCE_TYPES, Resource, ResourceType } from '../resources.models';
import { TeacherResourcesService } from '../resources.service';

/** Recursos (enlaces a PDF, videos, etc.) de una lección: listar, añadir, editar y quitar. */
@Component({
  selector: 'app-resource-panel',
  imports: [TranslatePipe, PublicUrlPipe, ReactiveFormsModule],
  templateUrl: './resource-panel.html',
  styleUrl: './resource-panel.scss',
})
export class ResourcePanel {
  private readonly api = inject(TeacherResourcesService);
  private readonly uploads = inject(UploadsService);
  private upload?: Subscription;

  readonly accept = RESOURCE_ACCEPT;
  readonly uploading = signal(false);
  readonly percent = signal(0);
  readonly uploadError = signal('');
  /** El archivo que se subió desde el computador (nombre y peso), o null si el recurso es un enlace. */
  readonly uploaded = signal<{ name: string; size: string; processing: boolean } | null>(null);

  readonly lessonId = input.required<number>();
  readonly initial = input.required<Resource[]>();

  readonly types = RESOURCE_TYPES;
  readonly labels = RESOURCE_LABELS;

  /** Lista local: arranca con la recibida y se actualiza sin recargar la página. */
  readonly resources = linkedSignal(() => this.initial());

  /** Recurso en edición; null = el formulario añade uno nuevo. */
  readonly editingId = signal<number | null>(null);
  readonly confirmId = signal<number | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');

  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(150)],
    }),
    type: new FormControl<ResourceType>('LINK', { nonNullable: true }),
    url: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        // Un enlace http(s) o un archivo subido a la plataforma.
        Validators.pattern(/^(https?:\/\/\S+|\/api\/uploads\/[a-f0-9]{32}\.[a-z0-9]+)$/i),
      ],
    }),
  });

  fieldError(name: 'title' | 'url'): string {
    const control = this.form.controls[name];

    if (!control.invalid || !(control.touched || control.dirty)) {
      return '';
    }

    if (control.hasError('required')) {
      return 'Este campo es obligatorio.';
    }

    return name === 'url'
      ? 'Escribe una URL válida que empiece por http:// o https://'
      : 'El título debe tener entre 2 y 150 caracteres.';
  }

  /** Sube un archivo del computador y deja su dirección en el formulario (con su tipo y, si falta, el título). */
  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (!file) return;

    this.uploadError.set('');

    const problem = validateResourceFile(file);

    if (problem) {
      this.uploadError.set(problem);
      return;
    }

    const kind = resourceFileKind(file.name)!;

    this.upload?.unsubscribe();
    this.uploading.set(true);
    this.percent.set(0);
    this.upload = this.uploads.upload(kind, file).subscribe({
      next: (event) => {
        if (event.type === 'progress') {
          this.percent.set(event.percent);
          return;
        }

        const { title, type, url } = this.form.controls;

        url.setValue(event.url);
        url.markAsDirty();
        type.setValue(resourceTypeOf(file.name, kind));

        if (!title.value.trim()) {
          title.setValue(file.name.replace(/\.[^.]+$/, '').slice(0, 150));
        }

        this.uploaded.set({ name: file.name, size: formatSize(file.size), processing: kind === 'video' });
        this.uploading.set(false);
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.uploadError.set(error instanceof Error ? error.message : 'No pudimos subir el archivo.');
      },
    });
  }

  /** Quita el archivo subido para escribir un enlace en su lugar. */
  clearFile(): void {
    this.uploaded.set(null);
    this.form.controls.url.setValue('');
  }

  startEdit(resource: Resource): void {
    this.error.set('');
    this.editingId.set(resource.id);
    this.uploaded.set(null);
    this.uploadError.set('');
    this.form.reset({ title: resource.title, type: resource.type, url: resource.url });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.upload?.unsubscribe();
    this.uploading.set(false);
    this.uploaded.set(null);
    this.uploadError.set('');
    this.form.reset({ title: '', type: 'LINK', url: '' });
  }

  submit(): void {
    this.error.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload = { title: value.title.trim(), type: value.type, url: value.url.trim() };
    const editingId = this.editingId();

    this.busy.set(true);

    const request =
      editingId === null
        ? this.api.create(this.lessonId(), payload)
        : this.api.update(editingId, payload);

    request.subscribe({
      next: (saved) => {
        this.resources.update((list) =>
          editingId === null
            ? [...list, saved]
            : list.map((item) => (item.id === saved.id ? saved : item)),
        );
        this.busy.set(false);
        this.cancelEdit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(error, 'No pudimos guardar el recurso.'));
      },
    });
  }

  remove(resource: Resource): void {
    this.error.set('');
    this.busy.set(true);

    this.api.remove(resource.id).subscribe({
      next: () => {
        this.resources.update((list) => list.filter((item) => item.id !== resource.id));
        this.confirmId.set(null);
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.confirmId.set(null);
        this.busy.set(false);
        this.error.set(apiErrorMessage(error, 'No pudimos eliminar el recurso.'));
      },
    });
  }
}
