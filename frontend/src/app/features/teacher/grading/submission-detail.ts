import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../../core/http/api-error';
import {
  GradingService,
  SubmissionDetail,
  SubmissionFile,
} from '../../../core/grading/grading.service';
import { downloadBlob } from '../../../core/utils/download';
import { fileSize, parseGrade } from './grade-input';

/** Una entrega de tarea: el texto y los archivos del estudiante, y la nota. */
@Component({
  selector: 'app-submission-detail',
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './submission-detail.html',
  styleUrl: './grading-detail.scss',
})
export class SubmissionDetailPage {
  private readonly api = inject(GradingService);
  private readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  readonly fileSize = fileSize;

  readonly submission = signal<SubmissionDetail | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly downloading = signal<string | null>(null);

  readonly score = signal('');
  readonly feedback = signal('');
  readonly tried = signal(false);

  constructor() {
    this.api
      .submission(this.id)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (submission) => {
          this.apply(submission);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos abrir la entrega.'));
          this.loading.set(false);
        },
      });
  }

  scoreInvalid(max: number): boolean {
    return this.tried() && parseGrade(this.score(), max) === null;
  }

  download(file: SubmissionFile): void {
    this.downloading.set(file.name);
    this.error.set('');

    this.api.file(file.name).subscribe({
      next: (blob) => {
        downloadBlob(blob, file.originalName);
        this.downloading.set(null);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos descargar el archivo.'));
        this.downloading.set(null);
      },
    });
  }

  save(max: number): void {
    this.tried.set(true);
    this.error.set('');
    this.notice.set('');

    const score = parseGrade(this.score(), max);

    if (score === null) {
      return;
    }

    this.saving.set(true);

    this.api
      .gradeSubmission(this.id, {
        score,
        ...(this.feedback().trim() ? { feedback: this.feedback().trim() } : {}),
      })
      .subscribe({
        next: (submission) => {
          this.apply(submission);
          this.tried.set(false);
          this.notice.set('Calificación guardada. El estudiante recibe un aviso con su nota.');
          this.saving.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos guardar la calificación.'));
          this.saving.set(false);
        },
      });
  }

  private apply(submission: SubmissionDetail): void {
    this.submission.set(submission);
    this.score.set(submission.score === null ? '' : String(submission.score));
    this.feedback.set(submission.feedback ?? '');
  }
}
