import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { CertificateTemplate } from '../../../../../core/certificates/certificates.models';
import { CertificatesService } from '../../../../../core/certificates/certificates.service';
import { TeacherCourse } from '../../teacher-courses.models';
import { TeacherCoursesService } from '../../teacher-courses.service';
import { CourseWizardService } from '../course-wizard.service';
import { splitDuration, toAdditionalUpdate } from '../wizard-mappers';

interface CandidateCourse {
  id: number;
  title: string;
}

/** Paso 3: qué aprenderá el estudiante, a quién va dirigido, duración, requisitos y prerrequisitos. */
@Component({
  selector: 'app-additional-step',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './additional-step.html',
  styleUrl: './additional-step.scss',
})
export class AdditionalStep {
  private readonly api = inject(TeacherCoursesService);
  private readonly wizard = inject(CourseWizardService);
  private readonly certificates = inject(CertificatesService);

  private readonly course = this.wizard.course() as NonNullable<
    ReturnType<CourseWizardService['course']>
  >;

  /** Los demás cursos que administra el usuario: candidatos a prerrequisito. */
  readonly candidates = signal<CandidateCourse[]>([]);
  readonly loadingCandidates = signal(true);

  /** Mis plantillas de certificado, para elegir cuál se emite al completar el curso. */
  readonly templates = signal<CertificateTemplate[]>([]);

  /** Lo que todavía no existe en el asistente; se muestra como aviso, sin enlaces falsos. */
  readonly upcoming = [
    { label: 'Adjuntos', hint: 'Archivos descargables del curso.' },
    { label: 'Clase en vivo', hint: 'Crear una reunión de Zoom asociada al curso.' },
  ];

  private readonly duration = splitDuration(this.course.durationMinutes);

  readonly form = new FormGroup({
    whatYouWillLearn: new FormControl(this.course.whatYouWillLearn ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(5000)],
    }),
    audience: new FormControl(this.course.audience ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(5000)],
    }),
    hours: new FormControl<number | null>(this.duration.hours, {
      validators: [Validators.min(0), Validators.max(1000)],
    }),
    minutes: new FormControl<number | null>(this.duration.minutes, {
      validators: [Validators.min(0), Validators.max(59)],
    }),
    materials: new FormControl(this.course.materials ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(5000)],
    }),
    requirements: new FormControl(this.course.requirements ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(5000)],
    }),
    certificateTemplateId: new FormControl<number | null>(
      this.course.certificateTemplate?.id ?? null,
    ),
    prerequisiteIds: new FormControl<number[]>(
      (this.course.prerequisites ?? []).map((item) => item.id),
      {
        nonNullable: true,
      },
    ),
  });

  constructor() {
    this.api
      .list()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (courses) => {
          this.candidates.set(this.toCandidates(courses));
          this.loadingCandidates.set(false);
        },
        error: () => this.loadingCandidates.set(false),
      });

    this.certificates
      .templates()
      .pipe(takeUntilDestroyed())
      .subscribe({ next: (templates) => this.templates.set(templates) });

    // Un aviso de un intento anterior ya no aplica en cuanto se vuelve a editar.
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.wizard.clearMessages());

    const unregister = this.wizard.register(() => this.save());
    inject(DestroyRef).onDestroy(unregister);
  }

  isSelected(id: number): boolean {
    return this.form.controls.prerequisiteIds.value.includes(id);
  }

  toggle(id: number, checked: boolean): void {
    const control = this.form.controls.prerequisiteIds;
    const current = control.value.filter((item) => item !== id);

    control.setValue(checked ? [...current, id] : current);
    control.markAsDirty();
  }

  onTemplate(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    this.form.controls.certificateTemplateId.setValue(value ? Number(value) : null);
    this.form.controls.certificateTemplateId.markAsDirty();
  }

  durationError(): string {
    const { hours, minutes } = this.form.controls;
    const touched = hours.touched || minutes.touched || hours.dirty || minutes.dirty;

    return touched && (hours.invalid || minutes.invalid)
      ? 'Las horas deben ser 0 o más y los minutos, entre 0 y 59.'
      : '';
  }

  private save(): Observable<TeacherCourse> | null {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return null;
    }

    return this.api.update(this.course.id, toAdditionalUpdate(this.form.getRawValue()));
  }

  /** Sin el propio curso, y conservando como opción un prerrequisito ya elegido aunque ya no sea del usuario. */
  private toCandidates(courses: TeacherCourse[]): CandidateCourse[] {
    const own = courses
      .filter((course) => course.id !== this.course.id)
      .map((course) => ({ id: course.id, title: course.title }));
    const known = new Set(own.map((course) => course.id));
    const extra = (this.course.prerequisites ?? []).filter((item) => !known.has(item.id));

    return [...own, ...extra];
  }
}
