import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, Observable } from 'rxjs';

import { apiErrorMessage } from '../../../../core/http/api-error';
import { moveItem } from '../../../../core/utils/reorder';
import { EvaluationSummary } from '../../evaluations/evaluations.models';
import { TeacherEvaluationsService } from '../../evaluations/evaluations.service';
import { Lesson } from '../../lessons/lessons.models';
import { TeacherLessonsService } from '../../lessons/lessons.service';
import { CourseModule } from '../modules.models';
import { TeacherModulesService } from '../modules.service';

/**
 * Un módulo del curso: se edita y se borra aquí mismo y gestiona sus lecciones.
 * Avisa con `changed` cuando algo se modificó para que la página recargue.
 */
@Component({
  selector: 'app-module-card',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './module-card.html',
  styleUrl: './module-card.scss',
})
export class ModuleCard {
  private readonly modulesApi = inject(TeacherModulesService);
  private readonly lessonsApi = inject(TeacherLessonsService);
  private readonly evaluationsApi = inject(TeacherEvaluationsService);

  readonly courseModule = input.required<CourseModule>();
  readonly courseId = input.required<number>();
  readonly index = input.required<number>();
  readonly total = input.required<number>();

  readonly changed = output<void>();
  /** -1 sube el módulo, 1 lo baja; la reordenación la hace la página. */
  readonly move = output<-1 | 1>();

  readonly editing = signal(false);
  readonly confirmDelete = signal(false);
  readonly confirmLessonId = signal<number | null>(null);
  readonly evaluations = signal<EvaluationSummary[]>([]);
  readonly confirmEvaluationId = signal<number | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');

  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(150)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(1000)],
    }),
  });

  constructor() {
    // Las evaluaciones no vienen con el curso: se piden al montar la tarjeta.
    effect(() => {
      const moduleId = this.courseModule().id;

      untracked(() => this.loadEvaluations(moduleId));
    });
  }

  private loadEvaluations(moduleId: number): void {
    this.evaluationsApi.listByModule(moduleId).subscribe({
      next: (list) => this.evaluations.set(list),
      error: (error: unknown) =>
        this.error.set(apiErrorMessage(error, 'No pudimos cargar las evaluaciones.')),
    });
  }

  removeEvaluation(evaluation: EvaluationSummary): void {
    this.error.set('');
    this.busy.set(true);

    this.evaluationsApi.remove(evaluation.id).subscribe({
      next: () => {
        this.evaluations.update((list) => list.filter((item) => item.id !== evaluation.id));
        this.confirmEvaluationId.set(null);
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.confirmEvaluationId.set(null);
        this.busy.set(false);
        this.error.set(apiErrorMessage(error, 'No pudimos eliminar la evaluación.'));
      },
    });
  }

  startEdit(): void {
    const current = this.courseModule();

    this.form.reset({ title: current.title, description: current.description ?? '' });
    this.error.set('');
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  titleError(): string {
    const control = this.form.controls.title;

    if (!control.invalid || !(control.touched || control.dirty)) {
      return '';
    }

    return control.hasError('required')
      ? 'El título es obligatorio.'
      : 'El título debe tener entre 2 y 150 caracteres.';
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();

    this.run(
      this.modulesApi.update(this.courseModule().id, {
        title: value.title.trim(),
        description: value.description.trim() || null,
      }),
      'No pudimos guardar el módulo.',
      () => this.editing.set(false),
    );
  }

  removeModule(): void {
    this.run(this.modulesApi.remove(this.courseModule().id), 'No pudimos eliminar el módulo.', () =>
      this.confirmDelete.set(false),
    );
  }

  removeLesson(lesson: Lesson): void {
    this.run(this.lessonsApi.remove(lesson.id), 'No pudimos eliminar la lección.', () =>
      this.confirmLessonId.set(null),
    );
  }

  moveLesson(index: number, delta: -1 | 1): void {
    const changes = moveItem(this.courseModule().lessons, index, index + delta);

    if (changes.length === 0) {
      return;
    }

    this.run(
      forkJoin(
        changes.map((change) => this.lessonsApi.update(change.id, { position: change.position })),
      ),
      'No pudimos reordenar las lecciones.',
    );
  }

  formatDuration(minutes: number | null): string {
    return minutes ? `${minutes} min` : '';
  }

  private run(request: Observable<unknown>, fallback: string, onSuccess?: () => void): void {
    this.error.set('');
    this.busy.set(true);

    request.subscribe({
      next: () => {
        this.busy.set(false);
        onSuccess?.();
        this.changed.emit();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.confirmDelete.set(false);
        this.confirmLessonId.set(null);
        this.error.set(apiErrorMessage(error, fallback));
      },
    });
  }
}
