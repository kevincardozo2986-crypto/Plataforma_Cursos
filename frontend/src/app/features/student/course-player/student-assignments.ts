import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { apiErrorMessage } from '../../../core/http/api-error';
import { DocumentFile } from '../../../core/uploads/document-rules';
import { formatSize } from '../../../core/uploads/upload-rules';
import { downloadBlob } from '../../../core/utils/download';
import { RichHtmlPipe } from '../../../shared/pipes/rich-html.pipe';
import { DocumentField } from '../../../shared/ui/document-field/document-field';
import { Icon } from '../../../shared/ui/icon/icon';

interface FileLink extends DocumentFile {
  url: string;
}

interface AssignmentItem {
  id: number;
  title: string;
  description: string | null;
  dueAt: string | null;
  allowLate: boolean;
  maxScore: number;
  attachments: FileLink[];
  mySubmission: { status: 'SUBMITTED' | 'GRADED'; score: number | null; late: boolean } | null;
}

interface MySubmission {
  id: number;
  status: 'SUBMITTED' | 'GRADED';
  late: boolean;
  text: string | null;
  files: FileLink[];
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
}

/**
 * Las tareas del módulo de la lección: el estudiante lee las instrucciones, descarga los documentos
 * que adjuntó el docente (PDF, Word, Excel…), devuelve su trabajo (texto y documentos) y, cuando
 * el docente la califica, ve su nota y su comentario.
 */
@Component({
  selector: 'app-student-assignments',
  imports: [DatePipe, FormsModule, RichHtmlPipe, DocumentField, Icon],
  templateUrl: './student-assignments.html',
  styleUrl: './student-assignments.scss',
})
export class StudentAssignments {
  private readonly http = inject(HttpClient);

  /** El módulo de la lección que se está viendo. */
  readonly moduleId = input.required<number>();

  readonly items = signal<AssignmentItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly openId = signal<number | null>(null);
  readonly detailLoading = signal(false);
  readonly mine = signal<MySubmission | null>(null);

  readonly text = signal('');
  readonly files = signal<DocumentFile[]>([]);
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly notice = signal('');
  readonly downloading = signal<string | null>(null);

  readonly size = formatSize;
  readonly open = computed(() => this.items().find((item) => item.id === this.openId()) ?? null);

  constructor() {
    effect(() => {
      const moduleId = this.moduleId();

      untracked(() => this.load(moduleId));
    });
  }

  private load(moduleId: number): void {
    this.loading.set(true);
    this.error.set('');
    this.openId.set(null);

    this.http.get<AssignmentItem[]>(`/api/modules/${moduleId}/assignments`).subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);

        // Con una sola tarea, se abre sola.
        if (items.length === 1) {
          this.toggle(items[0].id);
        }
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos cargar las tareas.'));
        this.loading.set(false);
      },
    });
  }

  toggle(id: number): void {
    if (this.openId() === id) {
      this.openId.set(null);
      return;
    }

    this.openId.set(id);
    this.mine.set(null);
    this.text.set('');
    this.files.set([]);
    this.formError.set('');
    this.notice.set('');
    this.detailLoading.set(true);

    this.http.get<MySubmission>(`/api/assignments/${id}/submission/mine`).subscribe({
      next: (submission) => {
        this.mine.set(submission);
        this.text.set(submission.text ?? '');
        this.files.set(
          submission.files.map(({ name, originalName, size }) => ({ name, originalName, size })),
        );
        this.detailLoading.set(false);
      },
      // Todavía no entregó: es lo normal, no un error.
      error: () => this.detailLoading.set(false),
    });
  }

  /** Estado de la tarea para la etiqueta de la lista. */
  stateOf(item: AssignmentItem): { label: string; tone: 'todo' | 'sent' | 'graded' | 'late' } {
    const submission = item.mySubmission;

    if (submission?.status === 'GRADED') {
      return { label: `Calificada · ${submission.score} de ${item.maxScore}`, tone: 'graded' };
    }
    if (submission) {
      return { label: 'Entregada · en revisión', tone: 'sent' };
    }

    return this.pastDue(item)
      ? { label: 'Vencida', tone: 'late' }
      : { label: 'Pendiente de entregar', tone: 'todo' };
  }

  pastDue(item: AssignmentItem): boolean {
    return !!item.dueAt && new Date(item.dueAt).getTime() < Date.now();
  }

  /** ¿Puede entregar o reenviar? No si ya la calificaron o si el plazo pasó y no se aceptan tardías. */
  canSubmit(item: AssignmentItem): boolean {
    return this.mine()?.status !== 'GRADED' && (!this.pastDue(item) || item.allowLate);
  }

  download(file: FileLink): void {
    this.downloading.set(file.name);

    this.http.get(file.url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        downloadBlob(blob, file.originalName);
        this.downloading.set(null);
      },
      error: (error: unknown) => {
        this.formError.set(apiErrorMessage(error, 'No pudimos descargar el archivo.'));
        this.downloading.set(null);
      },
    });
  }

  submit(item: AssignmentItem): void {
    this.formError.set('');
    this.notice.set('');

    if (!this.text().trim() && this.files().length === 0) {
      this.formError.set('Escribe una respuesta o adjunta al menos un documento.');
      return;
    }

    this.saving.set(true);

    this.http
      .put<MySubmission>(`/api/assignments/${item.id}/submission`, {
        text: this.text().trim() || undefined,
        files: this.files().map(({ name }) => ({ name })),
      })
      .subscribe({
        next: (submission) => {
          this.mine.set(submission);
          this.files.set(
            submission.files.map(({ name, originalName, size }) => ({ name, originalName, size })),
          );
          this.items.update((list) =>
            list.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    mySubmission: {
                      status: submission.status,
                      score: submission.score,
                      late: submission.late,
                    },
                  }
                : entry,
            ),
          );
          this.notice.set(
            submission.late
              ? 'Tarea entregada (fuera de plazo).'
              : 'Tarea entregada. Tu docente la calificará pronto.',
          );
          this.saving.set(false);
        },
        error: (error: unknown) => {
          this.formError.set(apiErrorMessage(error, 'No pudimos entregar la tarea.'));
          this.saving.set(false);
        },
      });
  }
}
