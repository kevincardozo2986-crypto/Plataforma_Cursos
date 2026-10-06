import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';

import { apiErrorMessage } from '../../../core/http/api-error';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import {
  correctIndexAfterRemoving,
  QuestionDraft,
  toQuestionDrafts,
  toQuestionInputs,
} from '../evaluation-mapper';
import { EvaluationInput } from '../evaluations.models';
import { TeacherEvaluationsService } from '../evaluations.service';

const MIN_OPTIONS = 2;

/** Crear (desde un módulo) o editar una evaluación con sus preguntas. */
@Component({
  selector: 'app-evaluation-form',
  imports: [ReactiveFormsModule, RouterLink, PageHeader],
  templateUrl: './evaluation-form.html',
  styleUrl: './evaluation-form.scss',
})
export class EvaluationForm {
  private readonly api = inject(TeacherEvaluationsService);
  private readonly router = inject(Router);
  private readonly params = inject(ActivatedRoute).snapshot.paramMap;

  readonly courseId = Number(this.params.get('id'));
  /** Presente solo al crear. */
  readonly moduleId = Number(this.params.get('moduleId')) || null;
  /** Presente solo al editar. */
  readonly evaluationId = Number(this.params.get('evaluationId')) || null;
  readonly isEdit = this.evaluationId !== null;

  readonly loading = signal(this.isEdit);
  readonly loaded = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(150)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(1000)],
    }),
    passingScore: new FormControl(60, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(100)],
    }),
    questions: new FormArray<QuestionGroup>([], { validators: [Validators.minLength(1)] }),
  });

  /** Puntos totales del quiz, para mostrarlos en la cabecera. */
  private readonly questionValues = toSignal(
    this.form.controls.questions.valueChanges.pipe(startWith(null)),
  );
  readonly totalPoints = computed(() => {
    this.questionValues();

    return this.form.controls.questions.controls.reduce(
      (sum, question) => sum + (Number(question.controls.points.value) || 0),
      0,
    );
  });

  constructor() {
    if (this.evaluationId !== null) {
      this.api.get(this.evaluationId).subscribe({
        next: (evaluation) => {
          this.form.patchValue({
            title: evaluation.title,
            description: evaluation.description ?? '',
            passingScore: evaluation.passingScore,
          });
          toQuestionDrafts(evaluation.questions).forEach((draft) =>
            this.form.controls.questions.push(this.newQuestion(draft)),
          );
          this.loading.set(false);
          this.loaded.set(true);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos cargar la evaluación.'));
          this.loading.set(false);
        },
      });
    } else {
      this.form.controls.questions.push(this.newQuestion());
      this.loaded.set(true);
    }
  }

  get questions(): FormArray<QuestionGroup> {
    return this.form.controls.questions;
  }

  addQuestion(): void {
    this.questions.push(this.newQuestion());
  }

  removeQuestion(index: number): void {
    if (this.questions.length > 1) {
      this.questions.removeAt(index);
    }
  }

  addOption(question: QuestionGroup): void {
    question.controls.options.push(this.newOption());
  }

  removeOption(question: QuestionGroup, index: number): void {
    const options = question.controls.options;

    if (options.length <= MIN_OPTIONS) {
      return;
    }

    question.controls.correctIndex.setValue(
      correctIndexAfterRemoving(question.controls.correctIndex.value, index),
    );
    options.removeAt(index);
  }

  /** ¿Se debe mostrar el error de este control? Solo tras tocarlo o intentar guardar. */
  shows(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  titleError(): string {
    const control = this.form.controls.title;

    if (!this.shows(control)) {
      return '';
    }

    return control.hasError('required')
      ? 'El título es obligatorio.'
      : 'El título debe tener entre 2 y 150 caracteres.';
  }

  scoreError(): string {
    return this.shows(this.form.controls.passingScore)
      ? 'Ingresa un porcentaje entre 0 y 100.'
      : '';
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
    const description = value.description.trim();

    const input: EvaluationInput = {
      title: value.title.trim(),
      // Al editar, null borra la descripción; al crear se omite.
      description: description || (this.isEdit ? null : undefined),
      passingScore: Number(value.passingScore),
      questions: toQuestionInputs(
        value.questions.map((question) => ({
          text: question.text,
          points: Number(question.points),
          correctIndex: question.correctIndex,
          options: question.options,
        })),
      ),
    };

    this.saving.set(true);

    const request =
      this.evaluationId !== null
        ? this.api.update(this.evaluationId, input)
        : this.api.create(this.moduleId as number, input);

    request.subscribe({
      next: () => {
        this.saving.set(false);

        if (this.isEdit) {
          this.form.markAsPristine();
          this.notice.set('Cambios guardados.');
        } else {
          void this.router.navigate(['/teacher/courses', this.courseId, 'edit', 'curriculum']);
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(error, 'No pudimos guardar la evaluación.'));
      },
    });
  }

  private newQuestion(draft?: QuestionDraft): QuestionGroup {
    const options = draft?.options ?? ['', ''];

    return new FormGroup({
      text: new FormControl(draft?.text ?? '', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(3)],
      }),
      points: new FormControl(draft?.points ?? 1, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(1), Validators.max(1000)],
      }),
      correctIndex: new FormControl(draft?.correctIndex ?? 0, { nonNullable: true }),
      options: new FormArray(options.map((text) => this.newOption(text))),
    });
  }

  private newOption(text = ''): FormControl<string> {
    return new FormControl(text, {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(300)],
    });
  }
}

type QuestionGroup = FormGroup<{
  text: FormControl<string>;
  points: FormControl<number>;
  correctIndex: FormControl<number>;
  options: FormArray<FormControl<string>>;
}>;
