import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, switchMap } from 'rxjs';

import { apiErrorMessage } from '../../../core/http/api-error';
import {
  CourseBreakdown,
  DashboardService,
  Period,
  PERIODS,
  TeacherDashboard,
} from '../../../core/dashboard/dashboard.service';
import { coverColorOf, monogram } from '../courses/course-list/course-list-helpers';
import { TeacherCourse } from '../courses/teacher-courses.models';
import { TeacherCoursesService } from '../courses/teacher-courses.service';
import {
  Bucket,
  barPath,
  bucketLabel,
  bucketNoun,
  deltaOf,
  layoutBars,
} from './chart';

type SortKey = 'title' | 'enrolled' | 'rate';

const STATUS_LABELS: Record<CourseBreakdown['status'], string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Archivado',
};

/** Tamaño del lienzo de la gráfica (el SVG se escala al ancho del panel, sin deformarse). */
const CANVAS = { width: 820, height: 360, left: 30, right: 0, top: 8, bottom: 28 };

/** Cuántas barritas lleva el minigráfico de inscripciones. */
const SPARK_MAX = 16;

const RING_LENGTH = 251.33; // 2π · 40

/** Resumen del docente: indicadores, gráfica de inscripciones y finalizaciones, avisos y tabla por curso. */
@Component({
  selector: 'app-teacher-stats',
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: './teacher-stats.html',
  styleUrl: './teacher-stats.scss',
})
export class TeacherStats {
  private readonly api = inject(DashboardService);
  private readonly coursesApi = inject(TeacherCoursesService);
  private readonly document = inject(DOCUMENT);
  private readonly reload$ = new Subject<void>();

  readonly periods = PERIODS;
  readonly statusLabels = STATUS_LABELS;
  readonly canvas = CANVAS;
  readonly ringLength = RING_LENGTH;
  readonly barPath = barPath;
  readonly stars = [1, 2, 3, 4, 5];

  // --- Estado ---
  readonly period = signal<Period>('30d');
  readonly courseId = signal<number | null>(null);
  readonly courses = signal<TeacherCourse[]>([]);
  readonly data = signal<TeacherDashboard | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly view = signal<'chart' | 'table'>('chart');
  readonly showDrafts = signal(false);
  readonly sortKey = signal<SortKey>('enrolled');
  readonly sortDir = signal<'asc' | 'desc'>('desc');
  readonly hover = signal<{ index: number; x: number; y: number; width: number } | null>(null);
  readonly toast = signal('');
  readonly asking = signal(false);

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private frame = 0;
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  /** Cifras que se cuentan hacia arriba al cambiar de periodo o de curso. */
  readonly shown = signal({ students: 0, enrollments: 0, rate: 0 });

  // --- Encabezado ---

  readonly periodLabel = computed(
    () => this.periods.find((item) => item.value === this.period())?.label.toLowerCase() ?? '',
  );

  readonly filteredCourse = computed(() => {
    const id = this.courseId();

    return id === null ? null : (this.courses().find((course) => course.id === id) ?? null);
  });

  readonly selectable = computed(() => this.courses().filter((course) => course.status !== 'DRAFT'));

  // --- Indicadores ---

  readonly targets = computed(() => {
    const data = this.data();

    return {
      students: data?.students ?? 0,
      enrollments: data?.completion.enrolled ?? 0,
      rate: data?.completion.rate ?? 0,
    };
  });

  readonly activeEnrollments = computed(() => {
    const completion = this.data()?.completion;

    return completion ? completion.enrolled - completion.cancelled : 0;
  });

  /** Con un curso filtrado o en «Todo» no hay periodo anterior con qué comparar. */
  readonly studentsDelta = computed(() => {
    const data = this.data();

    return data ? deltaOf(data.students, data.previous?.students) : null;
  });

  readonly enrollmentsDelta = computed(() => {
    const data = this.data();

    return data ? deltaOf(data.completion.enrolled, data.previous?.enrollments) : null;
  });

  readonly spark = computed(() => {
    const values = (this.data()?.series ?? []).slice(-SPARK_MAX).map((point) => point.enrollments);
    const max = Math.max(1, ...values);

    return values.map((value) => (value ? Math.max(5, (value / max) * 28) : 0));
  });

  readonly ringOffset = computed(() => RING_LENGTH * (1 - this.shown().rate / 100));
  readonly ringDone = computed(() => (this.data()?.completion.rate ?? 0) >= 50);

  readonly rating = computed(() => this.data()?.rating ?? { average: null, count: 0 });
  readonly ratingText = computed(() => this.oneDecimal(this.rating().average));

  // --- Gráfica ---

  readonly bucket = computed<Bucket>(() => this.data()?.bucket ?? 'day');
  readonly series = computed(() => this.data()?.series ?? []);
  readonly layout = computed(() => layoutBars(this.series(), CANVAS));
  readonly totals = computed(() =>
    this.series().reduce(
      (sum, point) => ({
        enrollments: sum.enrollments + point.enrollments,
        completions: sum.completions + point.completions,
      }),
      { enrollments: 0, completions: 0 },
    ),
  );
  readonly noun = computed(() => bucketNoun(this.bucket()));

  readonly bars = computed(() =>
    this.layout().groups.map((group) => {
      const point = this.series()[group.index];

      return {
        ...group,
        label: bucketLabel(point.date, this.bucket()),
        longLabel: bucketLabel(point.date, this.bucket(), true),
      };
    }),
  );

  readonly chartLabel = computed(
    () =>
      `Inscripciones y finalizaciones por ${this.noun()}. En el periodo: ${this.totals().enrollments} inscripciones y ${this.totals().completions} finalizaciones.`,
  );

  readonly tooltip = computed(() => {
    const hover = this.hover();
    const bar = hover ? this.bars()[hover.index] : null;

    if (!hover || !bar) return null;

    return {
      title: bar.longLabel,
      enrollments: bar.enrollments.value,
      completions: bar.completions.value,
      // Cerca del borde derecho el cuadro se abre hacia la izquierda.
      left: hover.x + 14 > hover.width - 180 ? hover.x - 170 : hover.x + 14,
      top: Math.max(0, hover.y - 20),
    };
  });

  // --- Lateral ---

  readonly states = computed(() => {
    const completion = this.data()?.completion;

    return completion
      ? [
          { key: 'done', label: 'Completadas', value: completion.completed },
          { key: 'prog', label: 'En progreso', value: completion.inProgress },
          { key: 'idle', label: 'Inactivas', value: completion.inactive },
          { key: 'new', label: 'Canceladas', value: completion.cancelled },
        ]
      : [];
  });

  readonly hasStates = computed(() => this.states().some((state) => state.value > 0));

  private readonly breakdown = computed(() => this.data()?.courseBreakdown ?? []);

  /** El curso con mejor finalización (de los que ya tienen inscritos y alguien terminó). */
  readonly best = computed(() => {
    const list = this.breakdown()
      .filter((course) => course.status !== 'DRAFT' && course.completed > 0)
      .sort((a, b) => b.completionRate - a.completionRate || b.enrolled - a.enrolled);

    return list[0] ?? null;
  });

  /** Publicados que no recibieron inscripciones en el periodo. */
  readonly empty = computed(() =>
    this.breakdown().filter((course) => course.status === 'PUBLISHED' && course.enrolled === 0),
  );

  readonly emptyNames = computed(() => {
    const names = this.empty().map((course) => course.title);
    const rest = names.length - 2;

    return names.slice(0, 2).join(', ') + (rest > 0 ? ` y ${rest} más` : '');
  });

  readonly drafts = computed(() => this.data()?.courses.draft ?? 0);
  readonly hasHighlights = computed(() => !!this.best() || this.empty().length > 0 || this.drafts() > 0);

  // --- Tabla por curso ---

  readonly rows = computed(() => {
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const key = this.sortKey();
    const list = this.breakdown()
      .filter((course) => this.showDrafts() || course.status !== 'DRAFT')
      .map((course) => ({
        ...course,
        color: coverColorOf(course.id),
        mono: monogram(course.title),
        // Sin inscritos no hay porcentaje: se ordena al final de «Finalización».
        rate: course.enrolled - course.cancelled > 0 ? course.completionRate : -1,
      }));

    return list.sort((a, b) => {
      const primary =
        key === 'title'
          ? a.title.localeCompare(b.title, 'es')
          : key === 'enrolled'
            ? a.enrolled - b.enrolled
            : a.rate - b.rate;

      return primary * dir || b.enrolled - a.enrolled;
    });
  });

  readonly maxEnrolled = computed(() => Math.max(1, ...this.rows().map((row) => row.enrolled)));

  constructor() {
    this.coursesApi
      .list()
      .pipe(takeUntilDestroyed())
      .subscribe({ next: (courses) => this.courses.set(courses) });

    this.reload$
      .pipe(
        // Si se cambia el filtro mientras carga, solo cuenta la última respuesta.
        switchMap(() => {
          this.loading.set(true);
          this.error.set('');

          return this.api.teacher(this.period(), this.courseId());
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.hover.set(null);
          this.loading.set(false);
        },
        // Un error no corta el flujo: el siguiente cambio de filtro vuelve a intentar.
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos cargar tus cifras.'));
          this.loading.set(false);
        },
      });

    // Los números suben hasta su valor cada vez que llegan datos nuevos.
    effect(() => {
      const target = this.targets();

      untracked(() => this.countTo(target));
    });

    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.frame);

      if (this.toastTimer) clearTimeout(this.toastTimer);
    });

    this.reload$.next();
  }

  // --- Filtros ---

  setPeriod(period: Period): void {
    this.period.set(period);
    this.reload$.next();
  }

  setCourse(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    this.courseId.set(value === 'all' ? null : Number(value));
    this.reload$.next();
  }

  /** Clic en una fila: filtra todo el resumen por ese curso; otro clic lo quita. */
  toggleCourse(id: number): void {
    const next = this.courseId() === id ? null : id;

    this.courseId.set(next);
    this.reload$.next();
    this.showToast(
      next === null
        ? 'Mostrando todos tus cursos.'
        : `Resumen de «${this.breakdown().find((course) => course.id === id)?.title ?? 'el curso'}».`,
    );
  }

  retry(): void {
    this.reload$.next();
  }

  setSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.update((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortKey.set(key);
      this.sortDir.set(key === 'title' ? 'asc' : 'desc');
    }
  }

  sortAria(key: SortKey): 'ascending' | 'descending' | 'none' {
    return this.sortKey() === key ? (this.sortDir() === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  // --- Gráfica: cuadro flotante ---

  onHover(event: PointerEvent, index: number): void {
    const box = this.panel()?.nativeElement.getBoundingClientRect();

    if (!box) return;

    this.hover.set({
      index,
      x: event.clientX - box.left,
      y: event.clientY - box.top,
      width: box.width,
    });
  }

  clearHover(): void {
    this.hover.set(null);
  }

  // --- Acciones ---

  /** Invita a reseñar a quienes terminaron (todos los cursos o uno). */
  askReviews(courseId: number | null, title?: string): void {
    if (this.asking()) return;

    this.asking.set(true);
    this.api.requestReviews(courseId).subscribe({
      next: ({ eligible, sent }) => {
        this.asking.set(false);

        if (sent > 0) {
          this.showToast(
            `Invitación a reseñar enviada a ${sent} ${sent === 1 ? 'persona' : 'personas'}${title ? ` de «${title}»` : ''}.`,
          );
        } else if (eligible > 0) {
          this.showToast('Ya les enviaste la invitación a todas las personas que terminaron.');
        } else {
          this.showToast('Todas las personas que terminaron ya dejaron su reseña.');
        }
      },
      error: (error: unknown) => {
        this.asking.set(false);
        this.showToast(apiErrorMessage(error, 'No pudimos enviar la invitación.'));
      },
    });
  }

  /** Copia los enlaces de los cursos sin inscritos para pegarlos en un anuncio o en un correo. */
  async copyLinks(): Promise<void> {
    const origin = this.document.location.origin;
    const links = this.empty()
      .map((course) => `${course.title}: ${origin}/courses/${course.id}`)
      .join('\n');

    try {
      await navigator.clipboard.writeText(links);
      this.showToast('Enlaces copiados. Pégalos en un anuncio o en tu correo.');
    } catch {
      this.showToast('No pudimos copiar los enlaces. Revisa los permisos del navegador.');
    }
  }

  canAskReview(course: CourseBreakdown): boolean {
    return course.completed > 0 && course.rating.average === null;
  }

  ratingOf(course: CourseBreakdown): string {
    return this.oneDecimal(course.rating.average);
  }

  /** 4 → «4,0»; 4.5 → «4,5». */
  private oneDecimal(value: number | null): string {
    return value === null ? '' : value.toFixed(1).replace('.', ',');
  }

  noteOf(course: CourseBreakdown): string {
    return String(course.averageScore ?? '').replace('.', ',');
  }

  // --- Internos ---

  private showToast(message: string): void {
    this.toast.set(message);

    if (this.toastTimer) clearTimeout(this.toastTimer);

    this.toastTimer = setTimeout(() => this.toast.set(''), 3200);
  }

  private countTo(target: { students: number; enrollments: number; rate: number }): void {
    cancelAnimationFrame(this.frame);

    const from = this.shown();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    if (reduce) {
      this.shown.set(target);

      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 650);
      const ease = 1 - (1 - progress) ** 3;
      const at = (a: number, b: number) => Math.round(a + (b - a) * ease);

      this.shown.set({
        students: at(from.students, target.students),
        enrollments: at(from.enrollments, target.enrollments),
        rate: at(from.rate, target.rate),
      });

      if (progress < 1) this.frame = requestAnimationFrame(step);
    };

    this.frame = requestAnimationFrame(step);
  }
}
