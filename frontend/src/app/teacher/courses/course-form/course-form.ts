import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../../core/http/api-error';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import {
  CategoryOption,
  CourseInput,
  CourseLevel,
  LEVEL_LABELS,
  LEVELS,
  TeacherCourse,
} from '../teacher-courses.models';
import { TeacherCoursesService } from '../teacher-courses.service';

@Component({
  selector: 'app-course-form',
  imports: [ReactiveFormsModule, RouterLink, PageHeader, StatusBadge],
  templateUrl: './course-form.html',
  styleUrl: './course-form.scss',
})
export class CourseForm {
  private readonly api = inject(TeacherCoursesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly levels = LEVELS;
  readonly levelLabels = LEVEL_LABELS;

  /** Id numérico si estamos editando; null si estamos creando. */
  readonly courseId = Number(this.route.snapshot.paramMap.get('id')) || null;
  readonly isEdit = this.courseId !== null;

  readonly course = signal<TeacherCourse | null>(null);
  readonly categories = signal<CategoryOption[]>([]);
  readonly loading = signal(this.isEdit);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3), Validators.maxLength(150)],
    }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    imageUrl: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(/^$|^https?:\/\/\S+$/i)],
    }),
    price: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(0), Validators.max(99999999.99)],
    }),
    level: new FormControl<CourseLevel>('BEGINNER', { nonNullable: true }),
    categoryId: new FormControl<number | null>(null),
  });

  /** Si el curso ya tiene categoría, el backend no permite dejarla vacía. */
  readonly canClearCategory = computed(() => !this.course()?.categoryId);

  readonly imagePreview = signal('');

  constructor() {
    this.api
      .categories()
      .pipe(takeUntilDestroyed())
      .subscribe({ next: (categories) => this.categories.set(categories) });

    this.form.controls.imageUrl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) =>
        this.imagePreview.set(this.form.controls.imageUrl.valid ? value.trim() : ''),
      );

    if (this.courseId !== null) {
      this.api
        .get(this.courseId)
        .pipe(takeUntilDestroyed())
        .subscribe({
          next: (course) => {
            this.course.set(course);
            this.form.patchValue({
              title: course.title,
              description: course.description,
              imageUrl: course.imageUrl ?? '',
              price: Number(course.price),
              level: course.level,
              categoryId: course.categoryId,
            });
            this.loading.set(false);
          },
          error: (error: unknown) => {
            this.error.set(apiErrorMessage(error, 'No pudimos cargar el curso.'));
            this.loading.set(false);
          },
        });
    }
  }

  /** Mensaje de error de un campo, o '' si es válido o aún no se tocó. */
  errorOf(name: 'title' | 'description' | 'imageUrl' | 'price'): string {
    const control = this.form.controls[name];

    if (!control.invalid || !(control.touched || control.dirty)) {
      return '';
    }

    if (control.hasError('required')) {
      return name === 'price' ? 'Ingresa el precio.' : 'Este campo es obligatorio.';
    }
    if (control.hasError('minlength')) {
      return 'Debe tener al menos 3 caracteres.';
    }
    if (control.hasError('maxlength')) {
      return 'Es demasiado largo.';
    }
    if (control.hasError('min')) {
      return 'El precio no puede ser negativo.';
    }
    if (control.hasError('pattern')) {
      return 'Escribe una URL válida que empiece por http:// o https://';
    }

    return 'Valor no válido.';
  }

  submit(): void {
    this.error.set('');
    this.notice.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const imageUrl = value.imageUrl.trim();

    const input: CourseInput = {
      title: value.title.trim(),
      description: value.description.trim(),
      price: Number(value.price),
      level: value.level,
      // Al editar, null borra la imagen; al crear se omite.
      imageUrl: imageUrl || (this.isEdit ? null : undefined),
      categoryId: value.categoryId ?? undefined,
    };

    this.saving.set(true);

    const request =
      this.courseId === null ? this.api.create(input) : this.api.update(this.courseId, input);

    request.subscribe({
      next: (saved) => {
        this.saving.set(false);

        if (this.isEdit) {
          this.course.set({ ...(this.course() as TeacherCourse), ...saved });
          this.form.markAsPristine();
          this.notice.set('Cambios guardados.');
        } else {
          void this.router.navigate(['/teacher/courses']);
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(error, 'No pudimos guardar el curso.'));
      },
    });
  }
}
