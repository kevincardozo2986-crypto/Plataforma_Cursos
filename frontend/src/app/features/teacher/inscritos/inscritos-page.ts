import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DOCUMENT } from '@angular/common';
import { Component, DestroyRef, HostListener, computed, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, concatMap, from } from 'rxjs';

import {
  AnalyticsService,
  StudentDetail,
  StudentRow,
} from '../../../core/dashboard/analytics.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { downloadCsv, toCsv } from '../../../core/utils/csv';
import {
  averagePct,
  countByState,
  daysSince,
  IX_GROUP,
  IX_LABELS,
  IX_ORDER,
  IxRow,
  IxState,
  matchesQuery,
  riskOf,
  SortDir,
  SortKey,
  sortRows,
  toIxRow,
  whenLabel,
} from './inscritos-helpers';

/** Estudiantes por página de la tabla. */
const PER_PAGE = 10;
/** El servidor entrega hasta 500 por consulta; se piden varias hasta traerlos todos (con tope). */
const FETCH_PAGE = 500;
const FETCH_MAX = 5000;
const RING = 251.33;

/** Un círculo del dibujo decorativo del encabezado. */
interface Dot {
  x: number;
  y: number;
  r: number;
  o: number;
}

/**
 * Inscritos: cómo va cada estudiante de los cursos del docente. Panorama del grupo (estados, avance
 * promedio, a quién recordarle), tabla con búsqueda, orden, selección y exportación, y un panel lateral
 * con el detalle de cada persona. Se traen todos los inscritos y se filtra aquí, para que los números
 * del panorama sean los de todo el grupo y no solo los de una página.
 */
@Component({
  selector: 'app-inscritos-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './inscritos-page.html',
  styleUrl: './inscritos-page.scss',
})
export class InscritosPage {
  private readonly analytics = inject(AnalyticsService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  readonly order = IX_ORDER;
  readonly labels = IX_LABELS;
  readonly group = IX_GROUP;
  readonly ring = RING;
  readonly whenLabel = whenLabel;

  readonly loading = signal(true);
  readonly error = signal('');
  readonly rows = signal<IxRow[]>([]);

  // Filtros y orden
  readonly state = signal<IxState | 'all'>('all');
  readonly query = signal('');
  readonly courseId = signal<number | 'all'>('all');
  readonly sortKey = signal<SortKey>('days');
  readonly sortDir = signal<SortDir>('asc');
  readonly page = signal(1);

  // Selección, panel lateral y avisos
  readonly selected = signal<ReadonlySet<number>>(new Set());
  readonly openId = signal<number | null>(null);
  readonly detail = signal<StudentDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');
  /** Inscripciones a las que ya se les recordó (en esta sesión o porque el servidor dijo que ya había uno hoy). */
  readonly reminded = signal<ReadonlySet<number>>(new Set());
  readonly sendingIds = signal<ReadonlySet<number>>(new Set());
  readonly bulkSending = signal(false);
  readonly toast = signal('');

  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private detailRequest: Subscription | null = null;

  /** Puntos del dibujo del encabezado (solo decoración). */
  readonly dots: Dot[] = Array.from({ length: 24 }, (_, i) => ({
    x: 224 + (i % 8) * 28,
    y: 120 + Math.floor(i / 8) * 28,
    r: [5, 7, 9][(i * 7) % 3],
    o: [0.25, 0.45, 0.7][(i * 5) % 3],
  }));

  /** Los cursos que aparecen en el selector (los que tienen inscritos). */
  readonly courses = computed(() => {
    const seen = new Map<number, string>();

    for (const row of this.rows()) seen.set(row.course.id, row.course.title);

    return [...seen].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title, 'es'));
  });

  /** Los inscritos del curso elegido (o de todos): es la base del panorama. */
  readonly base = computed(() => {
    const id = this.courseId();

    return id === 'all' ? this.rows() : this.rows().filter((row) => row.course.id === id);
  });

  readonly counts = computed(() => countByState(this.base()));
  readonly average = computed(() => averagePct(this.base()));
  readonly activeThisWeek = computed(() => this.base().filter((row) => row.days !== null && row.days <= 7).length);
  readonly neverStarted = computed(() => this.counts().new);
  readonly risk = computed(() => riskOf(this.base(), this.reminded()));
  readonly courseCount = computed(() => new Set(this.base().map((row) => row.course.id)).size);
  readonly donePercent = computed(() =>
    this.base().length === 0 ? 0 : Math.round((this.counts().done / this.base().length) * 100),
  );
  readonly avatars = computed(() => this.rows().slice(0, 2));
  readonly ringOffset = computed(() => RING * (1 - this.average() / 100));

  /** Los que cumplen estado y búsqueda, ya ordenados. */
  readonly filtered = computed(() => {
    const state = this.state();
    const query = this.query();
    const list = this.base().filter((row) => (state === 'all' || row.ix === state) && matchesQuery(row, query));

    return sortRows(list, this.sortKey(), this.sortDir());
  });

  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / PER_PAGE)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pages()));
  readonly pageRows = computed(() => {
    const start = (this.currentPage() - 1) * PER_PAGE;

    return this.filtered().slice(start, start + PER_PAGE);
  });
  readonly pageNumbers = computed(() => Array.from({ length: this.pages() }, (_, i) => i + 1));
  readonly range = computed(() => {
    const total = this.filtered().length;

    if (total === 0) return '0 inscritos';

    const start = (this.currentPage() - 1) * PER_PAGE;

    return `${start + 1}–${start + this.pageRows().length} de ${total} inscritos`;
  });

  readonly allChecked = computed(
    () => this.pageRows().length > 0 && this.pageRows().every((row) => this.selected().has(row.enrollmentId)),
  );
  readonly someChecked = computed(
    () => !this.allChecked() && this.pageRows().some((row) => this.selected().has(row.enrollmentId)),
  );
  readonly selectedRows = computed(() => this.rows().filter((row) => this.selected().has(row.enrollmentId)));

  readonly openRow = computed(() => this.rows().find((row) => row.enrollmentId === this.openId()) ?? null);

  /** Inactivos del grupo que se está mirando (para el aviso «Recordar a todos»). */
  readonly idleRows = computed(() => this.base().filter((row) => row.ix === 'idle' && !this.reminded().has(row.enrollmentId)));

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.detailRequest?.unsubscribe();
    });

    // Al abrir el panel lateral, el foco va a su botón de cerrar.
    effect(() => {
      const open = this.openId();
      const button = this.closeButton();

      if (open !== null && button) {
        untracked(() => setTimeout(() => button.nativeElement.focus(), 50));
      }
    });

    this.load();
  }

  // --- Carga ---

  load(): void {
    this.loading.set(true);
    this.error.set('');

    const all: StudentRow[] = [];
    const next = (offset: number): void => {
      this.analytics
        .students({ period: 'all', limit: FETCH_PAGE, offset })
        .subscribe({
          next: (page) => {
            all.push(...page.items);

            if (all.length < page.total && all.length < FETCH_MAX && page.items.length > 0) {
              next(offset + FETCH_PAGE);

              return;
            }

            const now = new Date();

            // Las inscripciones canceladas no se muestran: ya no son parte del grupo.
            this.rows.set(all.filter((row) => row.state !== 'CANCELLED').map((row) => toIxRow(row, now)));
            this.applyCourseFromRoute();
            this.loading.set(false);
          },
          error: (error: unknown) => {
            this.error.set(apiErrorMessage(error, 'No pudimos cargar a tus inscritos.'));
            this.loading.set(false);
          },
        });
    };

    next(0);
  }

  /** `?course=ID` (desde «Ver inscritos» en la lista de cursos) deja la pantalla en ese curso. */
  private applyCourseFromRoute(): void {
    const id = Number(this.route.snapshot.queryParamMap.get('course'));

    if (Number.isInteger(id) && id > 0 && this.rows().some((row) => row.course.id === id)) {
      this.courseId.set(id);
    }
  }

  // --- Filtros ---

  setState(state: IxState | 'all'): void {
    this.state.set(this.state() === state ? 'all' : state);
    this.page.set(1);
  }

  clearState(): void {
    this.state.set('all');
    this.page.set(1);
  }

  setQuery(value: string): void {
    this.query.set(value);
    this.page.set(1);
  }

  setCourse(value: string): void {
    this.courseId.set(value === 'all' ? 'all' : Number(value));
    this.page.set(1);
  }

  resetFilters(): void {
    this.state.set('all');
    this.query.set('');
    this.courseId.set('all');
    this.page.set(1);
  }

  sortBy(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortKey.set(key);
      // El avance se mira de mayor a menor; lo demás, de la A a la Z / lo más reciente primero.
      this.sortDir.set(key === 'pct' ? 'desc' : 'asc');
    }
  }

  dirOf(key: SortKey): SortDir | null {
    return this.sortKey() === key ? this.sortDir() : null;
  }

  goTo(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pages()));
  }

  // --- Selección ---

  isChecked(row: IxRow): boolean {
    return this.selected().has(row.enrollmentId);
  }

  toggleRow(row: IxRow, checked: boolean): void {
    this.selected.update((current) => {
      const next = new Set(current);

      if (checked) next.add(row.enrollmentId);
      else next.delete(row.enrollmentId);

      return next;
    });
  }

  toggleAll(checked: boolean): void {
    this.selected.update((current) => {
      const next = new Set(current);

      for (const row of this.pageRows()) {
        if (checked) next.add(row.enrollmentId);
        else next.delete(row.enrollmentId);
      }

      return next;
    });
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  // --- Panel lateral ---

  /** Clic en una fila: abre el panel, salvo que se haya tocado un botón o la casilla de la fila. */
  onRowClick(event: Event, row: IxRow): void {
    if ((event.target as HTMLElement).closest('button, input, a')) return;

    this.openDetail(row);
  }

  openDetail(row: IxRow): void {
    this.openId.set(row.enrollmentId);
    this.detail.set(null);
    this.detailError.set('');
    this.detailLoading.set(true);
    this.detailRequest?.unsubscribe();
    this.detailRequest = this.analytics.studentDetail(row.enrollmentId).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.detailLoading.set(false);
      },
      error: (error: unknown) => {
        this.detailError.set(apiErrorMessage(error, 'No pudimos cargar el detalle.'));
        this.detailLoading.set(false);
      },
    });
  }

  @HostListener('document:keydown.escape')
  closeDetail(): void {
    if (this.openId() === null) return;

    this.detailRequest?.unsubscribe();
    this.openId.set(null);
  }

  /** La primera lección sin hacer (la «actual») del panel lateral; -1 si terminó todas. */
  currentLesson(detail: StudentDetail): number {
    return detail.lessons.findIndex((lesson) => !lesson.done);
  }

  /** «Hoy», «Ayer» o «Hace N días» para un evento del panel lateral. */
  eventWhen(iso: string): string {
    return whenLabel(daysSince(iso, new Date()));
  }

  barHeight(value: number, weeks: number[]): number {
    const max = Math.max(1, ...weeks);

    return value === 0 ? 3 : Math.max(6, (value / max) * 48);
  }

  sparkHeight(value: number, weeks: number[]): number {
    const max = Math.max(1, ...weeks);

    return value === 0 ? 3 : Math.max(4, (value / max) * 18);
  }

  // --- Recordatorios ---

  /** ¿Se le puede recordar? Quien terminó no lo necesita. */
  canRemind(row: IxRow): boolean {
    return row.ix !== 'done';
  }

  isReminded(row: IxRow): boolean {
    return this.reminded().has(row.enrollmentId);
  }

  isSending(row: IxRow): boolean {
    return this.sendingIds().has(row.enrollmentId);
  }

  remind(row: IxRow): void {
    if (this.isSending(row) || this.isReminded(row)) return;

    this.setSending(row.enrollmentId, true);
    this.analytics.remind(row.enrollmentId).subscribe({
      next: () => {
        this.markReminded(row.enrollmentId);
        this.showToast(`Recordatorio enviado a ${row.student.firstName}.`);
      },
      error: (error: unknown) => {
        this.setSending(row.enrollmentId, false);

        if (error instanceof HttpErrorResponse && error.status === 409) {
          // El servidor ya le había mandado uno hoy: se deja marcado como enviado.
          this.markReminded(row.enrollmentId);
          this.showToast(`A ${row.student.firstName} ya le enviaste un recordatorio hoy.`);

          return;
        }

        this.showToast(apiErrorMessage(error, 'No pudimos enviar el recordatorio.'));
      },
    });
  }

  /** Envía el recordatorio a varios, de a uno, y resume cuántos salieron. */
  remindMany(targets: IxRow[]): void {
    const list = targets.filter((row) => this.canRemind(row) && !this.isReminded(row));

    if (list.length === 0) {
      this.showToast('Nadie de la selección necesita recordatorio.');

      return;
    }

    this.bulkSending.set(true);

    let sent = 0;
    let already = 0;
    let failed = 0;

    from(list)
      .pipe(
        concatMap(
          (row) =>
            new Promise<void>((resolve) => {
              this.analytics.remind(row.enrollmentId).subscribe({
                next: () => {
                  sent += 1;
                  this.markReminded(row.enrollmentId);
                  resolve();
                },
                error: (error: unknown) => {
                  if (error instanceof HttpErrorResponse && error.status === 409) {
                    already += 1;
                    this.markReminded(row.enrollmentId);
                  } else {
                    failed += 1;
                  }

                  resolve();
                },
              });
            }),
        ),
      )
      .subscribe({
        complete: () => {
          this.bulkSending.set(false);
          this.showToast(
            `Recordatorio enviado a ${sent} ${sent === 1 ? 'estudiante' : 'estudiantes'}` +
              (already ? ` (${already} ya lo tenían hoy)` : '') +
              (failed ? ` y ${failed} fallaron` : '') +
              '.',
          );
          this.clearSelection();
        },
      });
  }

  remindSelected(): void {
    this.remindMany(this.selectedRows());
  }

  remindIdle(): void {
    this.remindMany(this.idleRows());
  }

  private markReminded(id: number): void {
    this.reminded.update((current) => new Set(current).add(id));
    this.setSending(id, false);
  }

  private setSending(id: number, sending: boolean): void {
    this.sendingIds.update((current) => {
      const next = new Set(current);

      if (sending) next.add(id);
      else next.delete(id);

      return next;
    });
  }

  // --- Exportar y copiar ---

  exportAll(): void {
    this.exportRows(this.filtered(), 'inscritos');
  }

  exportSelection(): void {
    const rows = this.selectedRows();

    this.exportRows(rows, 'inscritos-seleccion');
    this.clearSelection();
  }

  private exportRows(rows: IxRow[], name: string): void {
    const stamp = new Date().toISOString().slice(0, 10);

    downloadCsv(
      `${name}-${stamp}`,
      toCsv(
        [
          'Nombre',
          'Apellido',
          'Correo',
          'Curso',
          'Estado',
          'Inscripción',
          'Última actividad',
          'Lecciones hechas',
          'Lecciones totales',
          'Avance (%)',
          'Quizzes presentados',
          'Quizzes del curso',
          'Tareas entregadas',
          'Tareas del curso',
          'Nota media de quizzes',
          'Nota media de tareas (%)',
        ],
        rows.map((row) => [
          row.student.firstName,
          row.student.lastName,
          row.student.email,
          row.course.title,
          IX_LABELS[row.ix],
          row.enrolledAt.slice(0, 10),
          row.lastActivityAt?.slice(0, 10) ?? '',
          row.progress.completed,
          row.progress.total,
          row.progress.percent,
          row.quizzes?.done ?? '',
          row.quizzes?.total ?? '',
          row.tasks?.done ?? '',
          row.tasks?.total ?? '',
          row.quizAverage,
          row.taskAverage,
        ]),
      ),
    );
    this.showToast(`Se descargaron ${rows.length} ${rows.length === 1 ? 'fila' : 'filas'}.`);
  }

  copyEmail(email: string): void {
    const copy = this.document.defaultView?.navigator?.clipboard?.writeText(email);

    void copy?.then(() => this.showToast('Correo copiado.'));
  }

  showToast(message: string): void {
    this.toast.set(message);

    if (this.toastTimer) clearTimeout(this.toastTimer);

    this.toastTimer = setTimeout(() => this.toast.set(''), 3200);
  }
}
