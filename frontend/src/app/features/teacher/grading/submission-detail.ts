import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../../core/http/api-error';
import {
  GradingService,
  SubmissionDetail,
  SubmissionFile,
} from '../../../core/grading/grading.service';
import { OFFICE_EXTENSIONS, officePreviewHtml } from '../../../core/utils/office-preview';
import { downloadBlob } from '../../../core/utils/download';
import { fileSize, parseGrade } from './grade-input';

/** Una entrega de tarea: el texto y los archivos del estudiante, y la nota. */
@Component({
  selector: 'app-submission-detail',
  imports: [TranslatePipe, FormsModule, RouterLink, DatePipe],
  templateUrl: './submission-detail.html',
  styleUrl: './grading-detail.scss',
})
export class SubmissionDetailPage {
  private readonly api = inject(GradingService);
  private readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  readonly fileSize = fileSize;

  private readonly sanitizer = inject(DomSanitizer);
  private objectUrl: string | null = null;

  /** Vista previa abierta: PDF, imagen o texto; los demás formatos solo se descargan. */
  readonly preview = signal<
    | { name: string; kind: 'pdf' | 'image'; url: SafeResourceUrl; raw: string }
    | { name: string; kind: 'text'; text: string }
    | { name: string; kind: 'html'; html: string }
    | { name: string; kind: 'none' }
    | null
  >(null);
  readonly previewing = signal<string | null>(null);

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
    inject(DestroyRef).onDestroy(() => this.revoke());
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

  /** Abre el archivo del estudiante aquí mismo, sin descargarlo. */
  openPreview(file: SubmissionFile): void {
    if (this.preview()?.name === file.name) {
      this.closePreview();
      return;
    }

    const extension = file.originalName.split('.').pop()?.toLowerCase() ?? '';
    const types: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
    };

    this.error.set('');

    if (extension === 'txt') {
      this.fetchPreview(file, (blob) => {
        void blob.text().then((text) => this.preview.set({ name: file.name, kind: 'text', text: text.slice(0, 200_000) }));
      });
      return;
    }

    if (OFFICE_EXTENSIONS.includes(extension)) {
      this.fetchPreview(file, (blob) => {
        officePreviewHtml(blob, extension)
          .then((html) => this.preview.set({ name: file.name, kind: 'html', html }))
          .catch(() =>
            this.error.set('No pudimos abrir este archivo aquí. Descárgalo para verlo completo.'),
          );
      });
      return;
    }

    const type = types[extension];

    if (!type) {
      this.closePreview();
      this.preview.set({ name: file.name, kind: 'none' });
      return;
    }

    this.fetchPreview(file, (blob) => {
      this.revoke();
      this.objectUrl = URL.createObjectURL(new Blob([blob], { type }));
      this.preview.set({
        name: file.name,
        kind: type === 'application/pdf' ? 'pdf' : 'image',
        url: this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl),
        raw: this.objectUrl,
      });
    });
  }

  closePreview(): void {
    this.revoke();
    this.preview.set(null);
  }

  private fetchPreview(file: SubmissionFile, done: (blob: Blob) => void): void {
    this.previewing.set(file.name);

    this.api.file(file.name).subscribe({
      next: (blob) => {
        done(blob);
        this.previewing.set(null);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos abrir el archivo.'));
        this.previewing.set(null);
      },
    });
  }

  private revoke(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
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
