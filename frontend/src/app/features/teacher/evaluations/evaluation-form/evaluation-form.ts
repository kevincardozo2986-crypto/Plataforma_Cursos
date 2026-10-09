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

import { apiErrorMessage } from '../../../../core/http/api-error';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import {
  changeType,
  markOnlyCorrect,
  newDraft,
  QuestionDraft,
  toQuestionDrafts,
  toQuestionInputs,
  validateQuestion,
} from '../evaluation-mapper';
import { EvaluationInput, QUESTION_TYPES, QuestionType } from '../evaluations.models';
import { TeacherEvaluationsService } from '../evaluations.service';

const MIN_OPTIONS = 2;

type OptionGroup = FormGroup<{ text: FormControl<string>; correct: FormControl<boolean> }>;

type QuestionGroup = FormGroup<{
  type: FormControl<QuestionType>;
  text: FormControl<string>;
  points: FormControl<number>;
  isTrue: FormControl<boolean>;
  options: FormArray<OptionGroup>;
  answers: FormArray<FormControl<string>>;
}>;

/** Crear (desde un módulo) o editar una evaluación con sus preguntas, de cinco tipos. */
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

  readonly types = QUESTION_TYPES;

  readonly loading = signal(this.isEdit);
  readonly loaded = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  /** Tras el primer intento de guardar se muestran los errores de cada pregunta. */
  readonly attempted = signal(false);

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

  private readonly questionValues = toSignal(
    this.form.controls.questions.valueChanges.pipe(startWith(null)),
  );

  /** Puntos totales del quiz, para mostrarlos en la cabecera. */
  readonly totalPoints = computed(() => {
    this.questionValues();

    return this.form.controls.questions.controls.reduce(
      (sum, question) => sum + (Number(question.controls.points.value) || 0),
      0,
    );
  });

  /** Cuántas preguntas se califican a mano, para avisarlo en la cabecera. */
  readonly manualCount = computed(() => {
    this.questionValues();

    return this.form.controls.questions.controls.filter(
      (question) => question.controls.type.value === 'ESSAY',
    ).length;
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

  typeHint(question: QuestionGroup): string {
    return this.types.find((entry) => entry.value === question.controls.type.value)?.hint ?? '';
  }

  hasOptions(question: QuestionGroup): boolean {
    return ['SINGLE', 'MULTIPLE'].includes(question.controls.type.value);
  }

  addQuestion(): void {
    this.questions.push(this.newQuestion());
  }

  removeQuestion(index: number): void {
    if (this.questions.length > 1) {
      this.questions.removeAt(index);
    }
  }

  setType(question: QuestionGroup, event: Event): void {
    const type = (event.target as HTMLSelectElement).value as QuestionType;
    const adjusted = changeType(this.draftOf(question), type);

    question.controls.type.setValue(type);
    question.controls.options.controls.forEach((option, index) =>
      option.controls.correct.setValue(adjusted.options[index].correct),
    );
  }

  addOption(question: QuestionGroup): void {
    question.controls.options.push(this.newOption());
  }

  removeOption(question: QuestionGroup, index: number): void {
    if (question.controls.options.length > MIN_OPTIONS) {
      question.controls.options.removeAt(index);
    }
  }

  /** Opción única: marcar una desmarca las demás. */
  chooseCorrect(question: QuestionGroup, index: number): void {
    const next = markOnlyCorrect(this.draftOf(question).options, index);

    question.controls.options.controls.forEach((option, position) =>
      option.controls.correct.setValue(next[position].correct),
    );
  }

  addAnswer(question: QuestionGroup): void {
    question.controls.answers.push(this.newAnswer());
  }

  removeAnswer(question: QuestionGroup, index: number): void {
    if (question.controls.answers.length > 1) {
      question.controls.answers.removeAt(index);
    }
  }

  /** Error de la pregunta, visible solo después de intentar guardar. */
  questionError(question: QuestionGroup): string {
    return this.attempted() ? (validateQuestion(this.draftOf(question)) ?? '') : '';
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
    this.attempted.set(true);

    const drafts = this.questions.controls.map((question) => this.draftOf(question));
    const invalidQuestion = drafts.findIndex((draft) => validateQuestion(draft) !== null);

    if (this.form.invalid || invalidQuestion !== -1) {
      this.form.markAllAsTouched();
      this.error.set(
        invalidQuestion !== -1
          ? `Pregunta ${invalidQuestion + 1}: ${validateQuestion(drafts[invalidQuestion])}`
          : 'Revisa los campos marcados antes de guardar.',
      );
      return;
    }

    const value = this.form.getRawValue();
    const description = value.description.trim();

    const input: EvaluationInput = {
      title: value.title.trim(),
      // Al editar, null borra la descripción; al crear se omite.
      description: description || (this.isEdit ? null : undefined),
      passingScore: Number(value.passingScore),
      questions: toQuestionInputs(drafts),
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

  private draftOf(question: QuestionGroup): QuestionDraft {
    const value = question.getRawValue();

    return {
      type: value.type,
      text: value.text,
      points: Number(value.points),
      isTrue: value.isTrue,
      options: value.options,
      answers: value.answers,
    };
  }

  private newQuestion(draft: QuestionDraft = newDraft()): QuestionGroup {
    return new FormGroup({
      type: new FormControl(draft.type, { nonNullable: true }),
      text: new FormControl(draft.text, {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(3)],
      }),
      points: new FormControl(draft.points, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(1), Validators.max(1000)],
      }),
      isTrue: new FormControl(draft.isTrue, { nonNullable: true }),
      options: new FormArray(
        draft.options.map((option) => this.newOption(option.text, option.correct)),
      ),
      answers: new FormArray(draft.answers.map((answer) => this.newAnswer(answer))),
    });
  }

  private newOption(text = '', correct = false): OptionGroup {
    return new FormGroup({
      text: new FormControl(text, {
        nonNullable: true,
        validators: [Validators.maxLength(300)],
      }),
      correct: new FormControl(correct, { nonNullable: true }),
    });
  }

  private newAnswer(text = ''): FormControl<string> {
    return new FormControl(text, { nonNullable: true, validators: [Validators.maxLength(300)] });
  }
}
