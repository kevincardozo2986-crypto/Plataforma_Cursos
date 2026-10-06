import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, tap } from 'rxjs';

import { slugify, SLUG_PATTERN } from '../../../../core/utils/slugify';
import { MediaField } from '../../../../shared/ui/media-field/media-field';
import {
  CategoryOption,
  CourseLevel,
  CourseVisibility,
  DRAFT_TITLE,
  LEVEL_LABELS,
  LEVELS,
  TeacherCourse,
  VISIBILITIES,
  VISIBILITY_LABELS,
} from '../../teacher-courses.models';
import { TeacherCoursesService } from '../../teacher-courses.service';
import { CourseWizardService } from '../course-wizard.service';
import { isAutoSlug, Pricing, pricingOf, toBasicsUpdate } from '../wizard-mappers';

/** Vacío, un enlace http(s) o un archivo ya subido a la plataforma. */
const URL_PATTERN = /^$|^(?:https?:\/\/\S+|\/api\/uploads\/[a-f0-9]{32}\.[a-z0-9]+)$/i;

/** Paso 1: título y dirección, descripción, opciones, precio, acceso, imagen y video. */
@Component({
  selector: 'app-basics-step',
  imports: [ReactiveFormsModule, MediaField],
  templateUrl: './basics-step.html',
  styleUrl: './basics-step.scss',
})
export class BasicsStep {
  private readonly api = inject(TeacherCoursesService);
  private readonly wizard = inject(CourseWizardService);

  readonly levels = LEVELS;
  readonly levelLabels = LEVEL_LABELS;
  readonly visibilities = VISIBILITIES;
  readonly visibilityInfo = VISIBILITY_LABELS;

  readonly course = this.wizard.course() as NonNullable<ReturnType<CourseWizardService['course']>>;
  readonly categories = signal<CategoryOption[]>([]);

  /** Mientras sea true, la dirección se escribe sola a partir del título. */
  readonly autoSlug = signal(isAutoSlug(this.course));

  /** Si el curso ya tiene categoría, el backend no permite dejarla vacía desde aquí. */
  readonly canClearCategory = this.course.categoryId === null;

  readonly form = new FormGroup({
    title: new FormControl(this.course.title === DRAFT_TITLE ? '' : this.course.title, {
      nonNullable: true,
      validators: [Validators.minLength(3), Validators.maxLength(150)],
    }),
    slug: new FormControl(this.course.slug, {
      nonNullable: true,
      validators: [Validators.pattern(SLUG_PATTERN), Validators.maxLength(120)],
    }),
    description: new FormControl(this.course.description, { nonNullable: true }),
    level: new FormControl<CourseLevel>(this.course.level, { nonNullable: true }),
    categoryId: new FormControl<number | null>(this.course.categoryId),
    pricing: new FormControl<Pricing>(pricingOf(this.course.price), { nonNullable: true }),
    price: new FormControl<number | null>(Number(this.course.price) || null),
    visibility: new FormControl<CourseVisibility>(this.course.visibility, { nonNullable: true }),
    accessPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.minLength(4), Validators.maxLength(100)],
    }),
    maxStudents: new FormControl<number | null>(this.course.maxStudents, {
      validators: [Validators.min(1)],
    }),
    publicContent: new FormControl(this.course.publicContent, { nonNullable: true }),
    qaEnabled: new FormControl(this.course.qaEnabled, { nonNullable: true }),
    imageUrl: new FormControl(this.course.imageUrl ?? '', {
      nonNullable: true,
      validators: [Validators.pattern(URL_PATTERN)],
    }),
    introVideoUrl: new FormControl(this.course.introVideoUrl ?? '', {
      nonNullable: true,
      validators: [Validators.pattern(URL_PATTERN)],
    }),
  });

  constructor() {
    this.api
      .categories()
      .pipe(takeUntilDestroyed())
      .subscribe({ next: (categories) => this.categories.set(categories) });

    // La dirección sigue al título hasta que el profesor la cambie a mano.
    this.form.controls.title.valueChanges.pipe(takeUntilDestroyed()).subscribe((title) => {
      const slug = slugify(title);

      if (this.autoSlug() && slug) {
        this.form.controls.slug.setValue(slug, { emitEvent: false });
      }
    });

    // El precio solo es obligatorio en un curso de pago.
    this.form.controls.pricing.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((pricing) => this.applyPricing(pricing));
    this.applyPricing(this.form.controls.pricing.value);

    // Un aviso de un intento anterior ya no aplica en cuanto se vuelve a editar.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.wizard.clearMessages());

    const unregister = this.wizard.register(() => this.save());
    inject(DestroyRef).onDestroy(unregister);
  }

  /** El profesor escribió la dirección: deja de seguir al título. */
  onSlugInput(): void {
    this.autoSlug.set(false);
  }

  regenerateSlug(): void {
    const slug = slugify(this.form.controls.title.value);

    if (slug) {
      this.form.controls.slug.setValue(slug);
    }

    this.autoSlug.set(true);
  }

  isPaid(): boolean {
    return this.form.controls.pricing.value === 'PAID';
  }

  needsPassword(): boolean {
    return this.form.controls.visibility.value === 'PASSWORD';
  }

  /** ¿Hay que escribir una contraseña? Sí si es con contraseña y todavía no hay ninguna guardada. */
  passwordRequired(): boolean {
    return this.needsPassword() && !this.hasSavedPassword();
  }

  /** Lee el estado actual: cambia al guardar una contraseña nueva. */
  hasSavedPassword(): boolean {
    return this.wizard.course()?.hasPassword === true;
  }

  /** Mensaje de error de un campo, o '' si es válido o aún no se tocó. */
  errorOf(name: 'title' | 'slug' | 'price' | 'accessPassword' | 'maxStudents' | 'imageUrl' | 'introVideoUrl'): string {
    const control = this.form.controls[name];

    if (!control.invalid || !(control.touched || control.dirty)) {
      return '';
    }

    if (control.hasError('required')) {
      return name === 'accessPassword' ? 'Escribe la contraseña del curso.' : 'Este campo es obligatorio.';
    }
    if (control.hasError('minlength')) {
      return name === 'accessPassword'
        ? 'La contraseña debe tener al menos 4 caracteres.'
        : 'Debe tener al menos 3 caracteres.';
    }
    if (control.hasError('maxlength')) {
      return 'Es demasiado largo.';
    }
    if (control.hasError('min')) {
      return name === 'maxStudents' ? 'El cupo debe ser de al menos 1 estudiante.' : 'Ingresa un precio mayor que 0.';
    }
    if (control.hasError('pattern')) {
      return name === 'slug'
        ? 'Usa solo minúsculas, números y guiones (sin guiones al principio, al final ni dobles).'
        : 'Escribe un enlace que empiece por http:// o https://, o sube un archivo.';
    }

    return 'Valor no válido.';
  }

  /** Lo que el asistente llama al guardar este paso. null = el formulario no es válido. */
  private save(): Observable<TeacherCourse> | null {
    const password = this.form.controls.accessPassword;

    if (this.passwordRequired() && !password.value.trim()) {
      password.setErrors({ required: true });
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return null;
    }

    return this.api
      .update(this.course.id, toBasicsUpdate(this.form.getRawValue()))
      .pipe(tap(() => this.form.controls.accessPassword.reset('')));
  }

  private applyPricing(pricing: Pricing): void {
    const price = this.form.controls.price;

    price.setValidators(pricing === 'PAID' ? [Validators.required, Validators.min(0.01)] : []);
    price.updateValueAndValidity({ emitEvent: false });
  }
}
