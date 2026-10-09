import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../../core/http/api-error';
import {
  AttemptDetail,
  AttemptQuestion,
  GradingService,
  QUESTION_TYPE_LABELS,
} from '../../../core/grading/grading.service';
import { parseGrade } from './grade-input';

interface Draft {
  points: string;
  comment: string;
}

/** Un intento de quiz: lo que respondió el estudiante y la nota de cada pregunta abierta. */
@Component({
  selector: 'app-attempt-detail',
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './attempt-detail.html',
  styleUrl: './grading-detail.scss',
})
export class AttemptDetailPage {
  private readonly api = inject(GradingService);
  private readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  readonly typeLabels = QUESTION_TYPE_LABELS;

  readonly attempt = signal<AttemptDetail | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  /** Lo que el docente va escribiendo, por pregunta abierta. */
  readonly drafts = signal<Record<number, Draft>>({});
  readonly feedback = signal('');
  readonly submitted = signal(false);

  /** Las abiertas con respuesta: lo único que se califica a mano. */
  readonly essays = computed(() =>
    (this.attempt()?.questions ?? []).filter(
      (question) => question.type === 'ESSAY' && question.written?.trim(),
    ),
  );

  constructor() {
    this.api
      .attempt(this.id)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (attempt) => {
          this.apply(attempt);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos abrir el intento.'));
          this.loading.set(false);
        },
      });
  }

  draft(question: AttemptQuestion): Draft {
    return this.drafts()[question.questionId] ?? { points: '', comment: '' };
  }

  edit(question: AttemptQuestion, field: keyof Draft, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;

    this.drafts.update((drafts) => ({
      ...drafts,
      [question.questionId]: { ...this.draft(question), [field]: value },
    }));
  }

  /** La nota escrita no es válida: vacía no cuenta como error, pero sí un decimal o un número de más. */
  invalid(question: AttemptQuestion): boolean {
    const { points } = this.draft(question);

    return this.submitted() && points.trim() !== '' && parseGrade(points, question.points) === null;
  }

  save(): void {
    this.submitted.set(true);
    this.error.set('');
    this.notice.set('');

    const grades: { questionId: number; points: number; comment?: string }[] = [];

    for (const question of this.essays()) {
      const { points, comment } = this.draft(question);

      if (points.trim() === '') {
        continue;
      }

      const parsed = parseGrade(points, question.points);

      if (parsed === null) {
        this.error.set(
          `La nota de «${this.shorten(question.text)}» debe ser un número entero entre 0 y ${question.points}.`,
        );
        return;
      }

      grades.push({
        questionId: question.questionId,
        points: parsed,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
    }

    if (grades.length === 0) {
      this.error.set('Escribe la nota de al menos una pregunta.');
      return;
    }

    this.saving.set(true);

    this.api
      .gradeAttempt(this.id, {
        grades,
        ...(this.feedback().trim() ? { feedback: this.feedback().trim() } : {}),
      })
      .subscribe({
        next: (attempt) => {
          this.apply(attempt);
          this.submitted.set(false);
          this.notice.set(
            attempt.status === 'GRADED'
              ? 'Calificación guardada. El estudiante ya ve su nota final.'
              : 'Notas guardadas. Aún quedan preguntas abiertas por calificar.',
          );
          this.saving.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos guardar la calificación.'));
          this.saving.set(false);
        },
      });
  }

  private apply(attempt: AttemptDetail): void {
    const drafts: Record<number, Draft> = {};

    for (const question of attempt.questions) {
      if (question.type === 'ESSAY' && question.written?.trim()) {
        drafts[question.questionId] = {
          points: question.graded && question.earned !== null ? String(question.earned) : '',
          comment: question.comment ?? '',
        };
      }
    }

    this.attempt.set(attempt);
    this.drafts.set(drafts);
    this.feedback.set(attempt.feedback ?? '');
  }

  private shorten(text: string): string {
    return text.length > 40 ? `${text.slice(0, 40).trimEnd()}…` : text;
  }
}
