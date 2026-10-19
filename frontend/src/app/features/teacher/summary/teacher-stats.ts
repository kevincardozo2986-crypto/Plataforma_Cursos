import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
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
  Rating,
  TeacherDashboard,
} from '../../../core/dashboard/dashboard.service';
import { TeacherCourse } from '../courses/teacher-courses.models';
import { TeacherCoursesService } from '../courses/teacher-courses.service';
import {
  compact,
  dateLabel,
  labelIndexes,
  linePath,
  nearestIndex,
  niceScale,
  xPositions,
  yPosition,
} from './chart';

// Medidas del dibujo (el SVG se escala al ancho de la tarjeta).
const WIDTH = 1000;
const HEIGHT = 300;
const MARGIN = { left: 46, right: 22, top: 16, bottom: 34 };

const STATUS_LABELS: Record<CourseBreakdown['status'], string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Archivado',
};

interface Tile {
  label: string;
  value: string;
  note: string;
}

const number = new Intl.NumberFormat('es-CO');

/** Resumen del docente: cifras, gráfica de inscripciones y finalizaciones, y tabla por curso. */
@Component({
  selector: 'app-teacher-stats',
  imports: [RouterLink],
  templateUrl: './teacher-stats.html',
  styleUrl: './teacher-stats.scss',
})
export class TeacherStats {
  private readonly api = inject(DashboardService);
  private readonly coursesApi = inject(TeacherCoursesService);

  readonly periods = PERIODS;
  readonly statusLabels = STATUS_LABELS;

  readonly width = WIDTH;
  readonly height = HEIGHT;
  readonly left = MARGIN.left;
  readonly right = WIDTH - MARGIN.right;
  readonly top = MARGIN.top;
  readonly bottom = HEIGHT - MARGIN.bottom;

  readonly period = signal<Period>('30d');
  readonly courseId = signal<number | null>(null);
  readonly courses = signal<TeacherCourse[]>([]);

  readonly data = signal<TeacherDashboard | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly view = signal<'chart' | 'table'>('chart');
  readonly active = signal<number | null>(null);

  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('svg');
  private readonly reload$ = new Subject<void>();

  // ---------- Cifras ----------

  readonly pending = computed(() => {
    const data = this.data();

    return data ? data.quizzes.pendingReview + data.assignments.pendingGrading : 0;
  });

  readonly tiles = computed<Tile[]>(() => {
    const data = this.data();

    if (!data) {
      return [];
    }

    const { completion, quizzes, courses, rating } = data;
    const active = completion.enrolled - completion.cancelled;

    return [
      {
        label: 'Estudiantes',
        value: number.format(data.students),
        note: 'con inscripción en el periodo',
      },
      {
        label: 'Inscripciones',
        value: number.format(completion.enrolled),
        note: `${number.format(completion.cancelled)} canceladas`,
      },
      {
        label: 'Finalización',
        value: `${completion.rate}%`,
        note: `${number.format(completion.completed)} de ${number.format(active)} terminaron`,
      },
      {
        label: 'Calificación',
        value: this.stars(rating),
        note: rating.count === 1 ? '1 reseña' : `${number.format(rating.count)} reseñas`,
      },
      {
        label: 'Quizzes',
        value: quizzes.attempts > 0 ? `${quizzes.averageScore}%` : '—',
        note:
          quizzes.attempts > 0
            ? `${quizzes.passRate}% aprobó · ${number.format(quizzes.attempts)} intentos`
            : 'sin intentos calificados',
      },
      {
        label: 'Cursos publicados',
        value: number.format(courses.published),
        note: `de ${number.format(courses.total)} (${number.format(courses.draft)} borradores)`,
      },
    ];
  });

  readonly states = computed(() => {
    const completion = this.data()?.completion;

    return completion
      ? [
          { label: 'Completadas', value: completion.completed },
          { label: 'En progreso', value: completion.inProgress },
          {
            label: 'Inactivas',
            value: completion.inactive,
            hint: `sin avanzar hace ${completion.inactiveAfterDays} días o más`,
          },
          { label: 'Canceladas', value: completion.cancelled },
        ]
      : [];
  });

  // ---------- Gráfica ----------

  private readonly series = computed(() => this.data()?.series ?? []);
  readonly hasMovement = computed(() =>
    this.series().some((point) => point.enrollments > 0 || point.completions > 0),
  );

  private readonly scale = computed(() =>
    niceScale(
      Math.max(0, ...this.series().flatMap((point) => [point.enrollments, point.completions])),
    ),
  );

  readonly xs = computed(() => xPositions(this.series().length, this.left, this.right));

  readonly yTicks = computed(() => {
    const { top, ticks } = this.scale();

    return ticks.map((tick) => ({
      label: compact(tick),
      y: yPosition(tick, top, this.top, this.bottom),
    }));
  });

  readonly xLabels = computed(() => {
    const bucket = this.data()?.bucket ?? 'day';
    const xs = this.xs();

    return labelIndexes(this.series().length, 6).map((index) => ({
      x: xs[index],
      text: dateLabel(this.series()[index].date, bucket),
    }));
  });

  private pointsOf(key: 'enrollments' | 'completions') {
    const { top } = this.scale();
    const xs = this.xs();

    return this.series().map((point, index) => ({
      x: xs[index],
      y: yPosition(point[key], top, this.top, this.bottom),
    }));
  }

  readonly enrollmentPoints = computed(() => this.pointsOf('enrollments'));
  readonly completionPoints = computed(() => this.pointsOf('completions'));
  readonly enrollmentPath = computed(() => linePath(this.enrollmentPoints()));
  readonly completionPath = computed(() => linePath(this.completionPoints()));

  /** Lo que muestra el cuadro flotante: el punto activo, con una fila por serie. */
  readonly tooltip = computed(() => {
    const index = this.active();
    const data = this.data();

    if (index === null || !data || !data.series[index]) {
      return null;
    }

    const point = data.series[index];
    const x = this.xs()[index];

    return {
      x,
      // Cerca del borde derecho el cuadro se abre hacia la izquierda.
      side: x > WIDTH * 0.62 ? 'left' : 'right',
      title: dateLabel(point.date, data.bucket, true),
      enrollments: number.format(point.enrollments),
      completions: number.format(point.completions),
    };
  });

  readonly rows = computed(() => {
    const data = this.data();

    return (data?.series ?? []).map((point) => ({
      label: dateLabel(point.date, data?.bucket ?? 'day', true),
      enrollments: point.enrollments,
      completions: point.completions,
    }));
  });

  readonly summary = computed(() => {
    const total = this.series().reduce(
      (sum, point) => ({
        enrollments: sum.enrollments + point.enrollments,
        completions: sum.completions + point.completions,
      }),
      { enrollments: 0, completions: 0 },
    );

    return `Inscripciones y finalizaciones por ${this.data()?.bucket === 'month' ? 'mes' : 'día'}. En el periodo: ${total.enrollments} inscripciones y ${total.completions} finalizaciones.`;
  });

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
          this.active.set(null);
          this.loading.set(false);
        },
        // Un error no corta el flujo: el siguiente cambio de filtro vuelve a intentar.
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos cargar tus cifras.'));
          this.loading.set(false);
        },
      });

    this.reload$.next();
  }

  setPeriod(period: Period): void {
    this.period.set(period);
    this.reload$.next();
  }

  setCourse(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    this.courseId.set(value ? Number(value) : null);
    this.reload$.next();
  }

  retry(): void {
    this.reload$.next();
  }

  // ---------- Interacción con la gráfica ----------

  onMove(event: PointerEvent): void {
    const svg = this.svg()?.nativeElement;

    if (!svg || this.series().length === 0) {
      return;
    }

    const box = svg.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * WIDTH;

    this.active.set(nearestIndex(x, this.xs()));
  }

  onKey(event: KeyboardEvent): void {
    const count = this.series().length;

    if (count === 0) {
      return;
    }

    const current = this.active() ?? count - 1;

    if (event.key === 'ArrowLeft') {
      this.active.set(Math.max(0, current - 1));
    } else if (event.key === 'ArrowRight') {
      this.active.set(Math.min(count - 1, current + 1));
    } else if (event.key === 'Home') {
      this.active.set(0);
    } else if (event.key === 'End') {
      this.active.set(count - 1);
    } else if (event.key === 'Escape') {
      this.active.set(null);
      return;
    } else {
      return;
    }

    event.preventDefault();
  }

  // ---------- Formato ----------

  stars(rating: Rating): string {
    return rating.average === null ? '—' : `${String(rating.average).replace('.', ',')} ★`;
  }

  score(value: number | null): string {
    return value === null ? '—' : `${value}%`;
  }

  fmt(value: number): string {
    return number.format(value);
  }
}
