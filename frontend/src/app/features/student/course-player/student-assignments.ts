import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, Subscription, catchError } from 'rxjs';

import { ToastService } from '../../../core/feedback/toast.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import {
  ACCEPT_DOCUMENTS,
  DOCUMENT_FORMATS,
  documentKind,
  validateDocument,
} from '../../../core/uploads/document-rules';
import { formatSize } from '../../../core/uploads/upload-rules';
import { UploadsService } from '../../../core/uploads/uploads.service';
import { downloadBlob } from '../../../core/utils/download';
import { RichHtmlPipe } from '../../../shared/pipes/rich-html.pipe';

interface FileLink {
  name: string;
  originalName: string;
  size: number;
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

/** Un archivo de la entrega: subiéndose, listo (ya está en el servidor) o con error. */
interface FileRow {
  key: number;
  name: string;
  size: number;
  /** Nombre con el que quedó guardado en el servidor; null mientras sube o si falló. */
  stored: string | null;
  percent: number;
  error: string;
}

interface Draft {
  text: string;
  files: FileRow[];
  saved: boolean;
}

export type TaskState = 'pending' | 'late' | 'done' | 'graded';

const MAX_FILES = 10;
const EMPTY: Draft = { text: '', files: [], saved: false };

/**
 * Las tareas del módulo: el estudiante lee las instrucciones, descarga el material del docente,
 * prepara su entrega (texto y documentos con barra de progreso), la confirma y, cuando el docente
 * la califica, ve su nota y su comentario.
 */
@Component({
  selector: 'app-student-assignments',
  imports: [TranslatePipe, DatePipe, FormsModule, RichHtmlPipe],
  templateUrl: './student-assignments.html',
  styleUrl: './student-assignments.scss',
})
export class StudentAssignments {
  private readonly http = inject(HttpClient);
  private readonly uploads = inject(UploadsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** El módulo de la lección que se está viendo. */
  readonly moduleId = input.required<number>();
  /** Número del módulo, para el título («Módulo 2 · Tareas»). */
  readonly moduleNumber = input<number | null>(null);
  /** Tarea que se abre sola al cargar (cuando se llega desde el temario o la bienvenida). */
  readonly focusId = input<number | null>(null);
  /** Avisa que el estudiante entregó, para refrescar sus requisitos. */
  readonly submitted = output<void>();

  readonly items = signal<AssignmentItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  /** Tareas desplegadas. */
  readonly openIds = signal<ReadonlySet<number>>(new Set());
  /** Lo que ya entregó el estudiante, por tarea. */
  readonly subs = signal<Record<number, MySubmission>>({});
  /** Borradores (texto y archivos) de las tareas por entregar o en edición. */
  readonly drafts = signal<Record<number, Draft>>({});
  /** Tareas cuya entrega se está editando. */
  readonly editing = signal<ReadonlySet<number>>(new Set());
  /** Documentos del docente que ya descargó (por nombre de archivo). */
  readonly seen = signal<ReadonlySet<string>>(new Set());

  readonly confirming = signal<number | null>(null);
  readonly sending = signal<number | null>(null);
  readonly overId = signal<number | null>(null);
  readonly downloading = signal<string | null>(null);
  readonly formError = signal<{ id: number; message: string } | null>(null);

  readonly accept = ACCEPT_DOCUMENTS;
  readonly formats = DOCUMENT_FORMATS;
  readonly maxFiles = MAX_FILES;
  readonly size = formatSize;

  readonly delivered = computed(() => this.items().filter((item) => !!item.mySubmission).length);

  private keySeq = 0;
  private readonly uploading = new Map<number, Subscription>();
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor() {
    effect(() => {
      const moduleId = this.moduleId();
      const focusId = this.focusId();

      untracked(() => this.load(moduleId, focusId));
    });

    this.destroyRef.onDestroy(() => {
      this.uploading.forEach((subscription) => subscription.unsubscribe());
      this.timers.forEach((timer) => clearTimeout(timer));
    });
  }

  // ---------------------------------------------------------------- carga

  private load(moduleId: number, focusId: number | null): void {
    this.loading.set(true);
    this.error.set('');
    this.openIds.set(new Set());
    this.confirming.set(null);
    this.editing.set(new Set());

    this.http.get<AssignmentItem[]>(`/api/modules/${moduleId}/assignments`).subscribe({
      next: (items) => {
        this.items.set(items);
        this.seen.set(this.readSeen(items));

        const delivered = items.filter((item) => item.mySubmission);

        // Lo que ya entregó se trae completo para mostrar su respuesta, sus archivos y su nota.
        (delivered.length
          ? forkJoin(
              delivered.map((item) =>
                this.http
                  .get<MySubmission>(`/api/assignments/${item.id}/submission/mine`)
                  .pipe(catchError(() => of(null))),
              ),
            )
          : of([] as (MySubmission | null)[])
        ).subscribe((results) => {
          const subs: Record<number, MySubmission> = {};

          results.forEach((result, index) => {
            if (result) subs[delivered[index].id] = result;
          });

          this.subs.set(subs);

          // Lo que dejó escrito (y no entregó) en una tarea vuelve a aparecer como borrador.
          const drafts: Record<number, Draft> = {};

          for (const item of items.filter((entry) => !entry.mySubmission)) {
            const text = this.load0(`campus.tk.draft:${item.id}`) ?? '';

            drafts[item.id] = { text, files: [], saved: !!text.trim() };
          }

          this.drafts.set(drafts);
          this.loading.set(false);

          // La tarea pedida, o la primera por entregar, se abre sola.
          const first =
            items.find((item) => item.id === focusId) ??
            items.find((item) => !item.mySubmission) ??
            items[0];

          if (first) this.openIds.set(new Set([first.id]));
        });
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos cargar las tareas.'));
        this.loading.set(false);
      },
    });
  }

  toggle(id: number): void {
    this.openIds.update((open) => {
      const next = new Set(open);

      if (!next.delete(id)) next.add(id);

      return next;
    });
  }

  // --------------------------------------------------------------- estados

  state(item: AssignmentItem): TaskState {
    if (item.mySubmission?.status === 'GRADED') return 'graded';
    if (item.mySubmission) return 'done';

    return this.pastDue(item) ? 'late' : 'pending';
  }

  pastDue(item: AssignmentItem): boolean {
    return !!item.dueAt && new Date(item.dueAt).getTime() < Date.now();
  }

  /** ¿Puede entregar o cambiar su entrega? No si ya la calificaron o si venció y no se aceptan tardías. */
  canSubmit(item: AssignmentItem): boolean {
    return this.state(item) !== 'graded' && (!this.pastDue(item) || item.allowLate);
  }

  /** ¿Se muestra el formulario? Cuando falta entregar, o cuando está cambiando una entrega. */
  showForm(item: AssignmentItem): boolean {
    const state = this.state(item);

    if (state === 'graded') return false;
    if (state === 'done') return this.editing().has(item.id) && this.canSubmit(item);

    return this.canSubmit(item);
  }

  /** «Faltan 1 d 14 h», «Faltan 5 h» o «Venció hace 2 d», con su nivel de urgencia. */
  countdown(item: AssignmentItem): { tone: 'ok' | 'soon' | 'late'; label: string } | null {
    if (!item.dueAt) return null;

    const ms = new Date(item.dueAt).getTime() - Date.now();

    if (ms < 0) return { tone: 'late', label: `Venció hace ${Math.max(1, Math.ceil(-ms / 864e5))} d` };

    const hours = Math.floor(ms / 36e5);
    const days = Math.floor(hours / 24);

    return {
      tone: hours < 48 ? 'soon' : 'ok',
      label: days ? `Faltan ${days} d ${hours % 24} h` : `Faltan ${Math.max(1, hours)} h`,
    };
  }

  /** Los tres pasos: 1 revisar el material, 2 preparar la entrega, 3 entregar. */
  steps(item: AssignmentItem): { n: number; label: string; ok: boolean; on: boolean }[] {
    const state = this.state(item);
    const delivered = state === 'done' || state === 'graded';
    const reviewed =
      item.attachments.length === 0 || item.attachments.some((file) => this.seen().has(file.name));
    const draft = this.draft(item.id);
    const prepared =
      !!draft.text.trim() || draft.files.some((file) => file.stored !== null);

    return [
      { n: 1, label: 'Revisa el material', ok: reviewed || delivered, on: !reviewed && !delivered },
      {
        n: 2,
        label: 'Prepara tu entrega',
        ok: prepared || delivered,
        on: (reviewed || delivered) === true && !prepared && !delivered,
      },
      { n: 3, label: 'Entrega', ok: delivered, on: reviewed && prepared && !delivered },
    ];
  }

  // ------------------------------------------------------------- borradores

  draft(id: number): Draft {
    return this.drafts()[id] ?? EMPTY;
  }

  private patch(id: number, change: Partial<Draft>): void {
    this.drafts.update((all) => ({ ...all, [id]: { ...(all[id] ?? EMPTY), ...change } }));
  }

  percentOf(score: number | null, max: number): number {
    return max > 0 ? Math.round(((score ?? 0) / max) * 100) : 0;
  }

  words(text: string): number {
    return text.trim().match(/\S+/g)?.length ?? 0;
  }

  onText(item: AssignmentItem, value: string): void {
    this.patch(item.id, { text: value, saved: false });
    clearTimeout(this.timers.get(item.id));
    this.timers.set(
      item.id,
      setTimeout(() => {
        this.store(`campus.tk.draft:${item.id}`, value);
        this.patch(item.id, { saved: !!value.trim() });
      }, 700),
    );
  }

  startEdit(item: AssignmentItem): void {
    const sub = this.subs()[item.id];

    this.drafts.update((all) => ({
      ...all,
      [item.id]: {
        text: sub?.text ?? '',
        saved: false,
        files: (sub?.files ?? []).map((file) => ({
          key: ++this.keySeq,
          name: file.originalName,
          size: file.size,
          stored: file.name,
          percent: 100,
          error: '',
        })),
      },
    }));
    this.editing.update((set) => new Set(set).add(item.id));
    this.toast.show('Puedes cambiar tu entrega mientras no la califiquen.');
  }

  // ---------------------------------------------------------------- archivos

  onPick(item: AssignmentItem, event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);

    input.value = '';
    this.addFiles(item, picked);
  }

  onDrag(item: AssignmentItem, event: DragEvent, over: boolean): void {
    event.preventDefault();
    this.overId.set(over ? item.id : null);
  }

  onDrop(item: AssignmentItem, event: DragEvent): void {
    event.preventDefault();
    this.overId.set(null);
    this.addFiles(item, Array.from(event.dataTransfer?.files ?? []));
  }

  private addFiles(item: AssignmentItem, picked: File[]): void {
    this.formError.set(null);

    for (const file of picked) {
      if (this.draft(item.id).files.length >= MAX_FILES) {
        this.formError.set({ id: item.id, message: `Máximo ${MAX_FILES} archivos por entrega.` });
        break;
      }

      const row: FileRow = {
        key: ++this.keySeq,
        name: file.name,
        size: file.size,
        stored: null,
        percent: 0,
        error: validateDocument(file) ?? '',
      };

      this.patch(item.id, { files: [...this.draft(item.id).files, row] });

      if (row.error) continue;

      this.uploading.set(
        row.key,
        this.uploads.upload('document', file).subscribe({
          next: (event) => {
            if (event.type === 'progress') {
              this.updateRow(item.id, row.key, { percent: event.percent });
              return;
            }

            this.updateRow(item.id, row.key, { percent: 100, stored: event.name, size: event.size });
          },
          error: (error: Error) =>
            this.updateRow(item.id, row.key, { percent: 100, error: error.message }),
        }),
      );
    }
  }

  private updateRow(id: number, key: number, change: Partial<FileRow>): void {
    this.patch(id, {
      files: this.draft(id).files.map((row) => (row.key === key ? { ...row, ...change } : row)),
    });
  }

  removeFile(item: AssignmentItem, row: FileRow): void {
    this.uploading.get(row.key)?.unsubscribe();
    this.uploading.delete(row.key);
    this.patch(item.id, { files: this.draft(item.id).files.filter((file) => file.key !== row.key) });
  }

  kind(name: string): string {
    switch (documentKind(name)) {
      case 'pdf':
        return 'pdf';
      case 'word':
        return 'doc';
      case 'excel':
        return 'xls';
      case 'powerpoint':
        return 'ppt';
      default:
        return 'zip';
    }
  }

  extension(name: string): string {
    return (name.split('.').pop() ?? '').toUpperCase().slice(0, 4);
  }

  // ------------------------------------------------------------------ entrega

  uploadingAny(id: number): boolean {
    return this.draft(id).files.some((file) => !file.error && file.stored === null);
  }

  readyToSend(id: number): boolean {
    const draft = this.draft(id);

    return (
      !this.uploadingAny(id) && (!!draft.text.trim() || draft.files.some((file) => file.stored !== null))
    );
  }

  summary(id: number): string {
    const draft = this.draft(id);
    const good = draft.files.filter((file) => file.stored !== null).length;
    const words = this.words(draft.text);

    if (this.uploadingAny(id)) return 'Espera a que terminen de subir los archivos…';
    if (!words && !good) return 'Escribe una respuesta o adjunta al menos un archivo.';

    const parts = [
      words ? `${words} palabra${words === 1 ? '' : 's'}` : '',
      good ? `${good} archivo${good === 1 ? '' : 's'}` : '',
    ].filter(Boolean);

    return `Listo para entregar: ${parts.join(' y ')}.`;
  }

  ask(item: AssignmentItem): void {
    if (this.readyToSend(item.id)) this.confirming.set(item.id);
  }

  cancel(): void {
    this.confirming.set(null);
  }

  send(item: AssignmentItem): void {
    if (this.sending() !== null || !this.readyToSend(item.id)) return;

    const draft = this.draft(item.id);

    this.formError.set(null);
    this.sending.set(item.id);

    this.http
      .put<MySubmission>(`/api/assignments/${item.id}/submission`, {
        text: draft.text.trim() || undefined,
        files: draft.files.filter((file) => file.stored !== null).map((file) => ({ name: file.stored })),
      })
      .subscribe({
        next: (submission) => {
          this.subs.update((all) => ({ ...all, [item.id]: submission }));
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
          this.drafts.update((all) => {
            const { [item.id]: _, ...rest } = all;

            return rest;
          });
          this.editing.update((set) => {
            const next = new Set(set);

            next.delete(item.id);

            return next;
          });
          this.store(`campus.tk.draft:${item.id}`, '');
          this.confirming.set(null);
          this.sending.set(null);
          this.toast.show(
            submission.late
              ? 'Tarea entregada (fuera de plazo). Tu docente ya puede verla.'
              : '¡Tarea entregada! Tu docente ya puede verla.',
            3500,
          );
          this.submitted.emit();
        },
        error: (error: unknown) => {
          this.formError.set({
            id: item.id,
            message: apiErrorMessage(error, 'No pudimos entregar la tarea.'),
          });
          this.confirming.set(null);
          this.sending.set(null);
        },
      });
  }

  // ---------------------------------------------------------------- descargas

  download(file: FileLink, item: AssignmentItem, teacher = false): void {
    this.downloading.set(file.name);

    this.http.get(file.url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        downloadBlob(blob, file.originalName);
        this.downloading.set(null);

        if (teacher) {
          this.seen.update((set) => new Set(set).add(file.name));
          this.store(`campus.tk.seen:${item.id}`, [...this.seen()].filter((n) => item.attachments.some((a) => a.name === n)).join(','));
        }
      },
      error: (error: unknown) => {
        this.formError.set({ id: item.id, message: apiErrorMessage(error, 'No pudimos descargar el archivo.') });
        this.downloading.set(null);
      },
    });
  }

  // ------------------------------------------------------------ almacenamiento

  private readSeen(items: AssignmentItem[]): Set<string> {
    const names = new Set<string>();

    for (const item of items) {
      (this.load0(`campus.tk.seen:${item.id}`) ?? '')
        .split(',')
        .filter(Boolean)
        .forEach((name) => names.add(name));
    }

    return names;
  }

  private load0(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private store(key: string, value: string): void {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch {
      // Sin almacenamiento (ventana privada): el borrador solo se pierde al recargar.
    }
  }
}
