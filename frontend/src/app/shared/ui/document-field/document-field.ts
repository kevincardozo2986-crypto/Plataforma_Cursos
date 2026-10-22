import { Component, computed, DestroyRef, inject, input, model, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import {
  ACCEPT_DOCUMENTS,
  DOCUMENT_FORMATS,
  DocumentFile,
  documentKind,
  DOCUMENT_LABELS,
  validateDocument,
} from '../../../core/uploads/document-rules';
import { UploadsService } from '../../../core/uploads/uploads.service';
import { formatSize } from '../../../core/uploads/upload-rules';
import { Icon } from '../icon/icon';

/**
 * Lista de documentos (PDF, Word, Excel, PowerPoint, ZIP o TXT) que se suben al servidor y se
 * adjuntan a una tarea o a una entrega. Cada archivo se sube al elegirlo; quitarlo de la lista
 * solo lo deja de adjuntar (el servidor limpia los que quedan sin uso al guardar).
 */
@Component({
  selector: 'app-document-field',
  imports: [Icon],
  template: `
    @if (files().length > 0) {
      <ul class="docs">
        @for (file of files(); track file.name) {
          <li class="doc">
            <span class="badge" [attr.data-kind]="kindOf(file)">{{ labelOf(file) }}</span>
            <span class="meta">
              <strong>{{ file.originalName }}</strong>
              <small>{{ size(file.size) }}</small>
            </span>
            @if (!disabled()) {
              <button
                type="button"
                class="remove"
                [attr.aria-label]="'Quitar ' + file.originalName"
                title="Quitar"
                (click)="remove(file)"
              >
                <app-icon name="x" [size]="16" />
              </button>
            }
          </li>
        }
      </ul>
    }

    @if (uploading()) {
      <div class="progress" role="progressbar" [attr.aria-valuenow]="percent()">
        <span [style.width.%]="percent()"></span>
      </div>
    }

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (!disabled() && canAdd()) {
      <label class="add" [class.busy]="uploading()">
        <app-icon name="plus" [size]="17" />
        <span>{{ files().length === 0 ? 'Adjuntar archivos' : 'Adjuntar otro archivo' }}</span>
        <input
          type="file"
          multiple
          [id]="inputId()"
          [attr.accept]="accept"
          [disabled]="uploading()"
          (change)="onPick($event)"
        />
      </label>
      <p class="hint">{{ formats }} · hasta 20 MB cada uno · máximo {{ max() }}.</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .docs {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0 0 10px;
      padding: 0;
      list-style: none;
    }

    .doc {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 9px 12px;
      background: var(--p-surface-2, #f0f5fb);
      border: 1px solid var(--p-border, #dbe4ef);
      border-radius: 10px;
    }

    .badge {
      display: grid;
      flex: none;
      place-items: center;
      min-width: 54px;
      padding: 4px 8px;
      color: #fff;
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.04em;
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
      font-size: 0.88rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meta small {
      color: var(--p-muted, #60738d);
      font-size: 0.74rem;
    }

    .remove {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      color: var(--p-danger, #b3261e);
      background: transparent;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
    }

    .remove:hover {
      background: var(--p-danger-soft, #fdeceb);
    }

    .add {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      color: var(--p-accent, #1267d8);
      font-size: 0.88rem;
      font-weight: 650;
      background: var(--p-accent-soft, #e6f0fd);
      border: 1.5px dashed var(--p-accent, #1267d8);
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

    .add:has(input:focus-visible) {
      outline: 3px solid var(--p-accent, #1267d8);
      outline-offset: 2px;
    }

    .hint {
      margin: 6px 0 0;
      color: var(--p-muted, #60738d);
      font-size: 0.76rem;
    }

    .error {
      margin: 0 0 8px;
      color: var(--p-danger, #b3261e);
      font-size: 0.84rem;
    }

    .progress {
      height: 8px;
      margin-bottom: 10px;
      overflow: hidden;
      background: var(--p-surface-2, #f0f5fb);
      border-radius: 999px;
    }

    .progress span {
      display: block;
      height: 100%;
      background: var(--p-accent, #1267d8);
      transition: width 0.2s;
    }
  `,
})
export class DocumentField {
  private readonly uploads = inject(UploadsService);

  readonly files = model<DocumentFile[]>([]);
  readonly max = input(10);
  readonly disabled = input(false);
  readonly inputId = input('documents');

  readonly accept = ACCEPT_DOCUMENTS;
  readonly formats = DOCUMENT_FORMATS;
  readonly size = formatSize;

  readonly uploading = signal(false);
  readonly percent = signal(0);
  readonly error = signal('');
  readonly canAdd = computed(() => this.files().length < this.max());

  private subscription: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.subscription?.unsubscribe());
  }

  kindOf(file: DocumentFile) {
    return documentKind(file.originalName);
  }

  labelOf(file: DocumentFile): string {
    return DOCUMENT_LABELS[documentKind(file.originalName)];
  }

  remove(file: DocumentFile): void {
    this.files.update((list) => list.filter((item) => item.name !== file.name));
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);

    input.value = '';
    this.error.set('');

    const room = this.max() - this.files().length;
    const queue: File[] = [];

    for (const file of picked) {
      const problem = validateDocument(file);

      if (problem) {
        this.error.set(`${file.name}: ${problem}`);
        return;
      }

      queue.push(file);
    }

    if (queue.length > room) {
      this.error.set(`Puedes adjuntar hasta ${this.max()} archivos.`);
      return;
    }

    this.uploadNext(queue);
  }

  /** Los archivos se suben de uno en uno, en el orden en que se eligieron. */
  private uploadNext(queue: File[]): void {
    const file = queue.shift();

    if (!file) {
      this.uploading.set(false);
      return;
    }

    this.uploading.set(true);
    this.percent.set(0);

    this.subscription?.unsubscribe();
    this.subscription = this.uploads.upload('document', file).subscribe({
      next: (event) => {
        if (event.type === 'progress') {
          this.percent.set(event.percent);
          return;
        }

        this.files.update((list) => [
          ...list,
          { name: event.name, originalName: file.name, size: event.size },
        ]);
        this.uploadNext(queue);
      },
      error: (error: Error) => {
        this.error.set(`${file.name}: ${error.message}`);
        this.uploading.set(false);
      },
    });
  }
}
