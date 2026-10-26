import { Component, effect, inject, input, signal, untracked } from '@angular/core';

import { CourseFile, CourseFilesService } from '../../../core/courses/course-files.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { DOCUMENT_LABELS, documentKind } from '../../../core/uploads/document-rules';
import { formatSize } from '../../../core/uploads/upload-rules';
import { downloadBlob } from '../../../core/utils/download';
import { Icon } from '../../../shared/ui/icon/icon';

/** Los archivos que el docente dejó para descargar en todo el curso (guías, plantillas, material). */
@Component({
  selector: 'app-course-files',
  imports: [Icon],
  template: `
    @if (files().length > 0) {
      <section class="box" aria-label="Archivos del curso">
        <h4><app-icon name="download" [size]="17" /> Archivos del curso</h4>
        <ul>
          @for (file of files(); track file.id) {
            <li>
              <button
                type="button"
                class="file"
                [disabled]="busy() === file.id"
                (click)="download(file)"
              >
                <span class="badge" [attr.data-kind]="kind(file)">{{ label(file) }}</span>
                <span class="name">{{ file.originalName }}</span>
                <small>{{ size(file.size) }}</small>
                <app-icon name="download" [size]="16" />
              </button>
            </li>
          }
        </ul>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .box {
      margin-bottom: 16px;
      padding: 14px 16px;
      background: #f6f9fd;
      border: 1px solid #dbe4ef;
      border-radius: 14px;
    }

    h4 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 10px;
      font-size: 0.95rem;
    }

    ul {
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
      width: 100%;
      padding: 9px 12px;
      color: #0a2b50;
      font: inherit;
      text-align: left;
      background: #fff;
      border: 1px solid #dbe4ef;
      border-radius: 10px;
      cursor: pointer;
    }

    .file:hover {
      border-color: #1267d8;
    }

    .name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      color: #5b6b7d;
    }

    .badge {
      display: grid;
      place-items: center;
      min-width: 52px;
      padding: 3px 8px;
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

    .error {
      margin: 8px 0 0;
      color: #b3261e;
      font-size: 0.84rem;
    }
  `,
})
export class CourseFiles {
  private readonly api = inject(CourseFilesService);

  readonly courseId = input.required<number>();

  readonly files = signal<CourseFile[]>([]);
  readonly busy = signal<number | null>(null);
  readonly error = signal('');
  readonly size = formatSize;

  constructor() {
    effect(() => {
      const id = this.courseId();

      untracked(() => {
        this.files.set([]);
        // Si no hay archivos (o no está inscrito), simplemente no se muestra nada.
        this.api
          .list(id)
          .subscribe({ next: (files) => this.files.set(files), error: () => this.files.set([]) });
      });
    });
  }

  kind(file: CourseFile) {
    return documentKind(file.originalName);
  }

  label(file: CourseFile): string {
    return DOCUMENT_LABELS[documentKind(file.originalName)];
  }

  download(file: CourseFile): void {
    this.busy.set(file.id);
    this.error.set('');

    this.api.download(file).subscribe({
      next: (blob) => {
        downloadBlob(blob, file.originalName);
        this.busy.set(null);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos descargar el archivo.'));
        this.busy.set(null);
      },
    });
  }
}
