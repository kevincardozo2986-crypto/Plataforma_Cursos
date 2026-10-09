import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../../core/http/api-error';
import { hasRichFormatting, htmlToText, textToHtml } from '../../../core/utils/html-text';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { AssignmentInput, TeacherAssignmentsService } from './assignments.service';
import { isoToLocalInput, localInputToIso } from './due-date';

/** Crear (desde un módulo) o editar una tarea. */
@Component({
  selector: 'app-assignment-form',
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './assignment-form.html',
  styleUrl: './assignment-form.scss',
})
export class AssignmentForm {
  private readonly api = inject(TeacherAssignmentsService);
  private readonly router = inject(Router);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  readonly courseId = Number(this.params.get('id'));
  /** Presente solo al crear. */
  readonly moduleId = Number(this.params.get('moduleId')) || null;
  /** Presente solo al editar. */
  readonly assignmentId = Number(this.params.get('assignmentId')) || null;
  readonly isEdit = this.assignmentId !== null;

  readonly loading = signal(this.isEdit);
  readonly loaded = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  /** La tarea tenía formato (negritas, enlaces…) que al editar como texto se pierde. */
  readonly losesFormat = signal(false);

  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(150)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(10000)],
    }),
    dueAt: new FormControl('', { nonNullable: true }),
    allowLate: new FormControl(true, { nonNullable: true }),
    maxScore: new FormControl(100, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(1000)],
    }),
  });

  constructor() {
    if (this.assignmentId === null) {
      this.loaded.set(true);
      return;
    }

    this.api.get(this.assignmentId).subscribe({
      next: (assignment) => {
        this.form.reset({
          title: assignment.title,
          description: htmlToText(assignment.description ?? ''),
          dueAt: isoToLocalInput(assignment.dueAt),
          allowLate: assignment.allowLate,
          maxScore: assignment.maxScore,
        });
        this.losesFormat.set(hasRichFormatting(assignment.description ?? ''));
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos cargar la tarea.'));
        this.loading.set(false);
      },
    });
  }

  shows(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];

    return control.invalid && (control.touched || control.dirty);
  }

  clearDate(): void {
    this.form.controls.dueAt.setValue('');
    this.form.controls.dueAt.markAsDirty();
  }

  submit(): void {
    this.error.set('');
    this.notice.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos marcados antes de guardar.');
      return;
    }

    const value = this.form.getRawValue();
    const dueAt = localInputToIso(value.dueAt);

    if (value.dueAt.trim() && dueAt === null) {
      this.error.set('La fecha límite no es válida.');
      return;
    }

    const input: AssignmentInput = {
      title: value.title.trim(),
      description: textToHtml(value.description),
      allowLate: value.allowLate,
      maxScore: Number(value.maxScore),
      // Al crear la fecha se omite si no hay; al editar, null la quita.
      dueAt: dueAt ?? (this.isEdit ? null : undefined),
    };

    this.saving.set(true);

    const request =
      this.assignmentId !== null
        ? this.api.update(this.assignmentId, input)
        : this.api.create(this.moduleId as number, input);

    request.subscribe({
      next: () => {
        this.saving.set(false);

        if (this.isEdit) {
          this.form.markAsPristine();
          this.losesFormat.set(false);
          this.notice.set('Cambios guardados.');
        } else {
          void this.router.navigate(['/teacher/courses', this.courseId, 'edit', 'curriculum']);
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(error, 'No pudimos guardar la tarea.'));
      },
    });
  }
}
