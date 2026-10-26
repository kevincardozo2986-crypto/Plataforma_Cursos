import { Component, effect, inject, input, signal, untracked } from '@angular/core';

import { CourseFile, CourseFilesService } from '../../../../../core/courses/course-files.service';
import { apiErrorMessage } from '../../../../../core/http/api-error';
import {
  ACCEPT_DOCUMENTS,
  DOCUMENT_FORMATS,
  DOCUMENT_LABELS,
  documentKind,
  validateDocument,
} from '../../../../../core/uploads/document-rules';
import { formatSize } from '../../../../../core/uploads/upload-rules';
import { UploadsService } from '../../../../../core/uploads/uploads.service';
import { downloadBlob } from '../../../../../core/utils/download';
import { Icon } from '../../../../../shared/ui/icon/icon';

const MAX_FILES = 20;

/**
 * Archivos descargables del curso (guías, plantillas, material): el docente los sube y los
 * estudiantes inscritos los bajan desde la pestaña «Recursos». Cada cambio se guarda al instante.
 */
@Component({
  selector: 'app-course-files-card',
  imports: [Icon],
  template: `
    <section class="wz-card tone-orange" aria-labelledby="files-title">
      <header class="wz-head">
        <span class="wz-icon" aria-hidden="true"><app-icon name="download" [size]="19" /></span>
        <div>
          <h2 id="files-title">Archivos del curso</h2>
          <p>Material que los estudiantes inscritos pueden descargar.</p>
        </div>
      </header>

      @if (loading()) {
        <p class="muted"><app-icon name="refresh" [size]="15" /> Cargando…</p>
      } @else {
        @if (files().length > 0) {
          <ul class="files">
            @for (file of files(); track file.id) {
              <li class="file">
                <span class="badge" [attr.data-kind]="kind(file)">{{ label(file) }}</span>
                <span class="meta">
                  <strong>{{ file.originalName }}</strong>
                  <small>{{ size(file.size) }}</small>
                </span>
                <button
                  type="button"
                  class="icon"
                  [attr.aria-label]="'Descargar ' + file.originalName"
                  title="Descargar"
                  (click)="download(file)"
                >
                  <app-icon name="download" [size]="16" />
                </button>
                @if (confirmId() === file.id) {
                  <button
                    type="button"
                    class="mini danger"
                    [disabled]="busy()"
                    (click)="remove(file)"
                  >
                    Sí, quitar
                  </button>
                  <button type="button" class="mini" (click)="confirmId.set(null)">No</button>
                } @else {
                  <button
                    type="button"
                    class="icon danger"
                    [attr.aria-label]="'Quitar ' + file.originalName"
                    title="Quitar"
                    (click)="confirmId.set(file.id)"
                  >
                    <app-icon name="trash" [size]="16" />
                  </button>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="empty">
            <app-icon name="info" [size]="15" /> Todavía no hay archivos. Súbelos aquí y aparecerán
            a tus estudiantes.
          </p>
        }

        @if (uploading()) {
          <div class="progress" role="progressbar" [attr.aria-valuenow]="percent()">
            <span [style.width.%]="percent()"></span>
          </div>
        }

        @if (files().length < max) {
          <label class="add" [class.busy]="uploading() || busy()">
            <app-icon name="plus" [size]="17" />
            <span>{{ files().length === 0 ? 'Subir archivos' : 'Subir otro archivo' }}</span>
            <input
              type="file"
              multiple
              [attr.accept]="accept"
              [disabled]="uploading() || busy()"
              (change)="onPick($event)"
            />
          </label>
          <p class="hint">{{ formats }} · hasta 20 MB cada uno · máximo {{ max }}.</p>
        }
      }

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .muted,
    .hint,
    .empty {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      color: var(--p-muted);
      font-size: 0.82rem;
    }

    .empty {
      padding: 10px 12px;
      background: var(--p-surface-2);
      border: 1px dashed var(--p-border);
      border-radius: 10px;
    }

    .files {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .file {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: var(--p-surface-2);
      border: 1px solid var(--p-border);
      border-radius: 10px;
    }

    .badge {
      display: grid;
      flex: none;
      place-items: center;
      min-width: 52px;
      padding: 4px 8px;
      color: #fff;
      font-size: 0.66rem;
      font-weight: 800;
      background: #64748b;
      border-radius: 6px;
    }

    .badge[data-kind='pdf'] {
      background: #dc2626;
    }
    .badge[data-kind='word'] {
      background: #2563eb;
    }
    .badge[data-kind='excel'] {
      background: #16a34a;
    }
    .badge[data-kind='powerpoint'] {
      background: #ea580c;
    }
    .badge[data-kind='zip'] {
      background: #7c3aed;
    }

    .meta {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
    }

    .meta strong {
      overflow: hidden;
      font-size: 0.86rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meta small {
      color: var(--p-muted);
      font-size: 0.72rem;
    }

    .icon,
    .mini {
      color: var(--p-ink);
      font: inherit;
      font-size: 0.76rem;
      font-weight: 650;
      background: var(--p-surface);
      border: 1px solid var(--p-border);
      border-radius: 8px;
      cursor: pointer;
    }

    .icon {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
    }

    .mini {
      padding: 4px 10px;
    }

    .danger {
      color: var(--p-danger);
    }

    .add {
      position: relative;
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
      gap: 8px;
      padding: 10px 16px;
      color: var(--p-accent);
      font-size: 0.88rem;
      font-weight: 650;
      background: var(--p-accent-soft);
      border: 1.5px dashed var(--p-accent);
      border-radius: 10px;
      cursor: pointer;
    }

    .add.busy {
      opacity: 0.6;
      pointer-events: none;
    }

    .add input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }

    .progress {
      height: 8px;
      overflow: hidden;
      background: var(--p-surface-2);
      border-radius: 999px;
    }

    .progress span {
      display: block;
      height: 100%;
      background: var(--p-accent);
      transition: width 0.2s;
    }

    .error {
      margin: 0;
      color: var(--p-danger);
      font-size: 0.84rem;
    }
  `,
})
export class CourseFilesCard {
  private readonly api = inject(CourseFilesService);
  private readonly uploads = inject(UploadsService);

  readonly courseId = input.required<number>();

  readonly files = signal<CourseFile[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly uploading = signal(false);
  readonly percent = signal(0);
  readonly error = signal('');
  readonly confirmId = signal<number | null>(null);

  readonly max = MAX_FILES;
  readonly accept = ACCEPT_DOCUMENTS;
  readonly formats = DOCUMENT_FORMATS;
  readonly size = formatSize;

  constructor() {
    effect(() => {
      const id = this.courseId();

      untracked(() => this.load(id));
    });
  }

  kind(file: CourseFile) {
    return documentKind(file.originalName);
  }

  label(file: CourseFile): string {
    return DOCUMENT_LABELS[documentKind(file.originalName)];
  }

  private load(courseId: number): void {
    this.api.list(courseId).subscribe({
      next: (files) => {
        this.files.set(files);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos cargar los archivos.'));
        this.loading.set(false);
      },
    });
  }

  download(file: CourseFile): void {
    this.api.download(file).subscribe({
      next: (blob) => downloadBlob(blob, file.originalName),
      error: (error: unknown) =>
        this.error.set(apiErrorMessage(error, 'No pudimos descargar el archivo.')),
    });
  }

  remove(file: CourseFile): void {
    this.busy.set(true);
    this.error.set('');

    this.api.remove(this.courseId(), file.id).subscribe({
      next: () => {
        this.files.update((list) => list.filter((item) => item.id !== file.id));
        this.confirmId.set(null);
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos quitar el archivo.'));
        this.confirmId.set(null);
        this.busy.set(false);
      },
    });
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);

    input.value = '';
    this.error.set('');

    const queue: File[] = [];

    for (const file of picked) {
      const problem = validateDocument(file);

      if (problem) {
        this.error.set(`${file.name}: ${problem}`);
        return;
      }

      queue.push(file);
    }

    if (this.files().length + queue.length > MAX_FILES) {
      this.error.set(`Un curso puede tener hasta ${MAX_FILES} archivos.`);
      return;
    }

    this.uploadNext(queue);
  }

  /** Cada archivo se sube y se adjunta al curso antes de pasar al siguiente. */
  private uploadNext(queue: File[]): void {
    const file = queue.shift();

    if (!file) {
      this.uploading.set(false);
      return;
    }

    this.uploading.set(true);
    this.percent.set(0);

    this.uploads.upload('document', file).subscribe({
      next: (event) => {
        if (event.type === 'progress') {
          this.percent.set(event.percent);
          return;
        }

        this.api.attach(this.courseId(), event.name).subscribe({
          next: (created) => {
            this.files.update((list) => [...list, created]);
            this.uploadNext(queue);
          },
          error: (error: unknown) => {
            this.error.set(`${file.name}: ${apiErrorMessage(error, 'No pudimos adjuntarlo.')}`);
            this.uploading.set(false);
          },
        });
      },
      error: (error: Error) => {
        this.error.set(`${file.name}: ${error.message}`);
        this.uploading.set(false);
      },
    });
  }
}
