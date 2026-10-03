import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { apiErrorMessage } from '../../../core/http/api-error';
import { moveItem } from '../../../core/utils/reorder';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ModuleCard } from '../../modules/module-card/module-card';
import { TeacherModulesService } from '../../modules/modules.service';
import { CourseStatus, CourseWithContent } from '../teacher-courses.models';
import { TeacherCoursesService } from '../teacher-courses.service';

/** Constructor del curso: módulos y lecciones, con opción de publicar. */
@Component({
  selector: 'app-course-content',
  imports: [ReactiveFormsModule, RouterLink, PageHeader, StatusBadge, ModuleCard],
  templateUrl: './course-content.html',
  styleUrl: './course-content.scss',
})
export class CourseContent {
  private readonly coursesApi = inject(TeacherCoursesService);
  private readonly modulesApi = inject(TeacherModulesService);

  readonly courseId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  readonly course = signal<CourseWithContent | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly adding = signal(false);

  readonly modules = computed(() => this.course()?.modules ?? []);
  readonly lessonCount = computed(() =>
    this.modules().reduce((total, module) => total + module.lessons.length, 0),
  );

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
    this.load();
  }

  /** (Re)carga el curso con su contenido. */
  load(): void {
    if (!this.courseId) {
      this.loading.set(false);
      return;
    }

    this.coursesApi.get(this.courseId).subscribe({
      next: (course) => {
        this.course.set(course);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos cargar el curso.'));
        this.loading.set(false);
      },
    });
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

  startAdding(): void {
    this.form.reset({ title: '', description: '' });
    this.adding.set(true);
  }

  addModule(): void {
    this.error.set('');
    this.notice.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    this.busy.set(true);

    this.modulesApi
      .create(this.courseId, {
        title: value.title.trim(),
        description: value.description.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.adding.set(false);
          this.load();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(apiErrorMessage(error, 'No pudimos crear el módulo.'));
        },
      });
  }

  moveModule(index: number, delta: -1 | 1): void {
    const changes = moveItem(this.modules(), index, index + delta);

    if (changes.length === 0) {
      return;
    }

    this.busy.set(true);

    forkJoin(
      changes.map((change) => this.modulesApi.update(change.id, { position: change.position })),
    ).subscribe({
      next: () => {
        this.busy.set(false);
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(error, 'No pudimos reordenar los módulos.'));
      },
    });
  }

  setStatus(status: CourseStatus): void {
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);

    this.coursesApi.setStatus(this.courseId, status).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.course.update((course) => (course ? { ...course, status: updated.status } : course));
        this.notice.set(
          status === 'PUBLISHED'
            ? 'El curso está publicado y ya aparece en el catálogo.'
            : 'El curso volvió a borrador.',
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(error, 'No pudimos cambiar el estado del curso.'));
      },
    });
  }
}
