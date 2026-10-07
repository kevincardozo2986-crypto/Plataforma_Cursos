import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../../../core/http/api-error';
import { MediaField } from '../../../../shared/ui/media-field/media-field';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { ResourcePanel } from '../../resources/resource-panel/resource-panel';
import { LessonInput, LessonWithResources } from '../lessons.models';
import { TeacherLessonsService } from '../lessons.service';

/** Crear (desde un módulo) o editar una lección, con sus recursos. */
@Component({
  selector: 'app-lesson-form',
  imports: [ReactiveFormsModule, RouterLink, PageHeader, ResourcePanel, MediaField],
  templateUrl: './lesson-form.html',
  styleUrl: './lesson-form.scss',
})
export class LessonForm {
  private readonly api = inject(TeacherLessonsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly params = this.route.snapshot.paramMap;

  readonly courseId = Number(this.params.get('id'));
  /** Presente solo al crear. */
  readonly moduleId = Number(this.params.get('moduleId')) || null;
  /** Presente solo al editar. */
  readonly lessonId = Number(this.params.get('lessonId')) || null;
  readonly isEdit = this.lessonId !== null;

  readonly lesson = signal<LessonWithResources | null>(null);
  readonly loading = signal(this.isEdit);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal(
    this.route.snapshot.queryParamMap.get('created')
      ? 'Lección creada. Ahora puedes añadir recursos.'
      : '',
  );

  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(150)],
    }),
    content: new FormControl('', { nonNullable: true }),
    videoUrl: new FormControl('', {
      nonNullable: true,
      // Vacío, un enlace http(s) o un archivo ya subido a la plataforma.
      validators: [
        Validators.pattern(/^$|^(?:https?:\/\/\S+|\/api\/uploads\/[a-f0-9]{32}\.[a-z0-9]+)$/i),
      ],
    }),
    durationMinutes: new FormControl<number | null>(null, {
      validators: [Validators.min(1), Validators.max(100000)],
    }),
  });

  constructor() {
    if (this.lessonId !== null) {
      this.api.get(this.lessonId).subscribe({
        next: (lesson) => {
          this.lesson.set(lesson);
          this.form.patchValue({
            title: lesson.title,
            content: lesson.content ?? '',
            videoUrl: lesson.videoUrl ?? '',
            durationMinutes: lesson.durationMinutes,
          });
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos cargar la lección.'));
          this.loading.set(false);
        },
      });
    }
  }

  errorOf(name: 'title' | 'videoUrl' | 'durationMinutes'): string {
    const control = this.form.controls[name];

    if (!control.invalid || !(control.touched || control.dirty)) {
      return '';
    }

    if (control.hasError('required')) {
      return 'El título es obligatorio.';
    }
    if (control.hasError('minlength') || control.hasError('maxlength')) {
      return 'El título debe tener entre 2 y 150 caracteres.';
    }
    if (control.hasError('pattern')) {
      return 'Escribe un enlace que empiece por http:// o https://, o sube un archivo.';
    }

    return 'Ingresa una duración válida en minutos (1 o más).';
  }

  submit(): void {
    this.error.set('');
    this.notice.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const content = value.content.trim();
    const videoUrl = value.videoUrl.trim();
    const duration = value.durationMinutes;
    // Al editar, null borra el valor; al crear, lo omitimos.
    const empty = this.isEdit ? null : undefined;

    const input: LessonInput = {
      title: value.title.trim(),
      content: content || empty,
      videoUrl: videoUrl || empty,
      durationMinutes: duration ? Number(duration) : empty,
    };

    this.saving.set(true);

    const request =
      this.lessonId !== null
        ? this.api.update(this.lessonId, input)
        : this.api.create(this.moduleId as number, input);

    request.subscribe({
      next: (saved) => {
        this.saving.set(false);

        if (this.isEdit) {
          this.lesson.update((current) => (current ? { ...current, ...saved } : current));
          this.form.markAsPristine();
          this.notice.set('Cambios guardados.');
        } else {
          void this.router.navigate(
            ['/teacher/courses', this.courseId, 'lessons', saved.id, 'edit'],
            { queryParams: { created: 1 } },
          );
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(error, 'No pudimos guardar la lección.'));
      },
    });
  }
}
