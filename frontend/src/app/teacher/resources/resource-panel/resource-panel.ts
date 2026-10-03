import { Component, inject, input, linkedSignal, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { apiErrorMessage } from '../../../core/http/api-error';
import {
  RESOURCE_LABELS,
  RESOURCE_TYPES,
  Resource,
  ResourceType,
} from '../resources.models';
import { TeacherResourcesService } from '../resources.service';

/** Recursos (enlaces a PDF, videos, etc.) de una lección: listar, añadir, editar y quitar. */
@Component({
  selector: 'app-resource-panel',
  imports: [ReactiveFormsModule],
  templateUrl: './resource-panel.html',
  styleUrl: './resource-panel.scss',
})
export class ResourcePanel {
  private readonly api = inject(TeacherResourcesService);

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
      validators: [Validators.required, Validators.pattern(/^https?:\/\/\S+$/i)],
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

  startEdit(resource: Resource): void {
    this.error.set('');
    this.editingId.set(resource.id);
    this.form.reset({ title: resource.title, type: resource.type, url: resource.url });
  }

  cancelEdit(): void {
    this.editingId.set(null);
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
