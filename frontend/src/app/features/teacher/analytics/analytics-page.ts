import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';

import {
  AnalyticsService,
  RatingsReport,
  STUDENT_STATE_LABELS,
  StudentRow,
  StudentState,
} from '../../../core/dashboard/analytics.service';
import {
  CourseBreakdown,
  DashboardService,
  Period,
  PERIODS,
  TeacherDashboard,
} from '../../../core/dashboard/dashboard.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { downloadCsv, toCsv } from '../../../core/utils/csv';
import { Icon } from '../../../shared/ui/icon/icon';
import { TeacherCourse } from '../courses/teacher-courses.models';
import { TeacherCoursesService } from '../courses/teacher-courses.service';

type Tab = 'courses' | 'students' | 'ratings';

const PAGE_SIZE = 25;
const EXPORT_PAGE = 500;
const EXPORT_MAX = 5000;

const STATUS_LABELS: Record<CourseBreakdown['status'], string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Archivado',
};

const number = new Intl.NumberFormat('es-CO');

/**
 * Analíticas del docente: cómo van sus cursos, quiénes avanzan (y quiénes se quedaron atrás) y qué
 * dicen las reseñas, con filtros por periodo y curso y exportación a CSV (Excel).
 */
@Component({
  selector: 'app-analytics-page',
  imports: [DatePipe, RouterLink, Icon],
  templateUrl: './analytics-page.html',
  styleUrl: './analytics-page.scss',
})
export class AnalyticsPage {
  private readonly dashboardApi = inject(DashboardService);
  private readonly analytics = inject(AnalyticsService);
  private readonly coursesApi = inject(TeacherCoursesService);

  readonly periods = PERIODS;
  readonly statusLabels = STATUS_LABELS;
  readonly stateLabels = STUDENT_STATE_LABELS;
  readonly states = Object.keys(STUDENT_STATE_LABELS) as StudentState[];
  readonly fmt = (value: number): string => number.format(value);
  readonly pageSize = PAGE_SIZE;
  readonly Math = Math;

  readonly tab = signal<Tab>('courses');
  readonly period = signal<Period>('30d');
  readonly courseId = signal<number | null>(null);
  readonly courses = signal<TeacherCourse[]>([]);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly exporting = signal(false);
  readonly notice = signal('');

  readonly data = signal<TeacherDashboard | null>(null);
  readonly ratings = signal<RatingsReport | null>(null);

  // Estudiantes
  readonly students = signal<StudentRow[]>([]);
  readonly studentsTotal = signal(0);
  readonly studentsLoading = signal(false);
  readonly state = signal<StudentState | ''>('');
  readonly search = signal('');
  readonly offset = signal(0);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private request: Subscription | null = null;
  private studentsRequest: Subscription | null = null;

  readonly from = computed(() => (this.studentsTotal() === 0 ? 0 : this.offset() + 1));
  readonly to = computed(() => Math.min(this.offset() + PAGE_SIZE, this.studentsTotal()));
  readonly hasPrev = computed(() => this.offset() > 0);
  readonly hasNext = computed(() => this.offset() + PAGE_SIZE < this.studentsTotal());

  /** Columnas de la gráfica de inscripciones: cada una con su altura relativa. */
  readonly bars = computed(() => {
    const series = this.data()?.series ?? [];
    const max = Math.max(
      1,
      ...series.map((point) => Math.max(point.enrollments, point.completions)),
    );

    return series.map((point) => ({
      label: this.dateLabel(point.date),
      enrollments: point.enrollments,
      completions: point.completions,
      enrollHeight: (point.enrollments / max) * 100,
      doneHeight: (point.completions / max) * 100,
    }));
  });

  readonly maxEnrolled = computed(() =>
    Math.max(1, ...(this.data()?.courseBreakdown ?? []).map((course) => course.enrolled)),
  );

  readonly tiles = computed(() => {
    const data = this.data();

    if (!data) {
      return [];
    }

    return [
      {
        icon: 'users' as const,
        tone: 'blue',
        label: 'Estudiantes',
        value: number.format(data.students),
      },
      {
        icon: 'clipboard' as const,
        tone: 'orange',
        label: 'Inscripciones',
        value: number.format(data.completion.enrolled),
      },
      {
        icon: 'check-circle' as const,
        tone: 'green',
        label: 'Finalización',
        value: `${data.completion.rate}%`,
      },
      {
        icon: 'clock' as const,
        tone: 'amber',
        label: 'Inactivos',
        value: number.format(data.completion.inactive),
      },
      {
        icon: 'star' as const,
        tone: 'violet',
        label: 'Calificación',
        value: data.rating.average === null ? '—' : String(data.rating.average),
      },
    ];
  });

  constructor() {
    this.coursesApi.list().subscribe({ next: (courses) => this.courses.set(courses) });
    this.load();
  }

  // ---------- Carga ----------

  private load(): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');

    this.request = forkJoin({
      dashboard: this.dashboardApi.teacher(this.period(), this.courseId()),
      ratings: this.analytics.ratings(this.period(), this.courseId()),
    }).subscribe({
      next: ({ dashboard, ratings }) => {
        this.data.set(dashboard);
        this.ratings.set(ratings);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos cargar las analíticas.'));
        this.loading.set(false);
      },
    });

    this.offset.set(0);
    this.loadStudents();
  }

  private loadStudents(): void {
    this.studentsRequest?.unsubscribe();
    this.studentsLoading.set(true);

    this.studentsRequest = this.analytics
      .students({
        period: this.period(),
        courseId: this.courseId(),
        state: this.state(),
        q: this.search(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      })
      .subscribe({
        next: (page) => {
          this.students.set(page.items);
          this.studentsTotal.set(page.total);
          this.studentsLoading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos cargar a los estudiantes.'));
          this.studentsLoading.set(false);
        },
      });
  }

  // ---------- Filtros ----------

  setPeriod(period: Period): void {
    this.period.set(period);
    this.load();
  }

  setCourse(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    this.courseId.set(value ? Number(value) : null);
    this.load();
  }

  setState(event: Event): void {
    this.state.set((event.target as HTMLSelectElement).value as StudentState | '');
    this.offset.set(0);
    this.loadStudents();
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);

    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    // Se espera a que deje de escribir para no pedir en cada letra.
    this.searchTimer = setTimeout(() => {
      this.offset.set(0);
      this.loadStudents();
    }, 350);
  }

  page(step: 1 | -1): void {
    this.offset.update((value) => Math.max(0, value + step * PAGE_SIZE));
    this.loadStudents();
  }

  // ---------- Etiquetas ----------

  dateLabel(date: string): string {
    const [year, month, day] = date.split('-').map(Number);
    const names = [
      'ene',
      'feb',
      'mar',
      'abr',
      'may',
      'jun',
      'jul',
      'ago',
      'sep',
      'oct',
      'nov',
      'dic',
    ];

    return day ? `${day} ${names[month - 1]}` : `${names[month - 1]} ${year}`;
  }

  stars(rating: number): string {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  }

  initials(student: StudentRow['student']): string {
    return ((student.firstName[0] ?? '') + (student.lastName[0] ?? '')).toUpperCase();
  }

  // ---------- Exportar ----------

  exportCurrent(): void {
    this.notice.set('');
    this.error.set('');

    const stamp = new Date().toISOString().slice(0, 10);

    switch (this.tab()) {
      case 'courses':
        return this.exportCourses(stamp);
      case 'students':
        return this.exportStudents(stamp);
      default:
        return this.exportRatings(stamp);
    }
  }

  private exportCourses(stamp: string): void {
    const rows = this.data()?.courseBreakdown ?? [];

    downloadCsv(
      `cursos-${stamp}`,
      toCsv(
        [
          'Curso',
          'Estado',
          'Inscritos',
          'Terminaron',
          'Cancelaron',
          'Finalización (%)',
          'Nota media de quizzes',
          'Calificación',
          'Reseñas',
        ],
        rows.map((course) => [
          course.title,
          STATUS_LABELS[course.status],
          course.enrolled,
          course.completed,
          course.cancelled,
          course.completionRate,
          course.averageScore,
          course.rating.average,
          course.rating.count,
        ]),
      ),
    );
    this.notice.set(`Se descargó el reporte de ${rows.length} cursos.`);
  }

  /** Baja a todos los estudiantes del filtro actual, no solo la página que se ve. */
  private exportStudents(stamp: string): void {
    this.exporting.set(true);

    const all: StudentRow[] = [];
    const next = (offset: number): void => {
      this.analytics
        .students({
          period: this.period(),
          courseId: this.courseId(),
          state: this.state(),
          q: this.search(),
          limit: EXPORT_PAGE,
          offset,
        })
        .subscribe({
          next: (page) => {
            all.push(...page.items);

            if (all.length < page.total && all.length < EXPORT_MAX && page.items.length > 0) {
              next(offset + EXPORT_PAGE);
              return;
            }

            downloadCsv(
              `estudiantes-${stamp}`,
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
                  'Nota media de quizzes',
                  'Nota media de tareas (%)',
                ],
                all.map((row) => [
                  row.student.firstName,
                  row.student.lastName,
                  row.student.email,
                  row.course.title,
                  STUDENT_STATE_LABELS[row.state],
                  row.enrolledAt.slice(0, 10),
                  row.lastActivityAt?.slice(0, 10) ?? '',
                  row.progress.completed,
                  row.progress.total,
                  row.progress.percent,
                  row.quizAverage,
                  row.taskAverage,
                ]),
              ),
            );
            this.notice.set(
              all.length < page.total
                ? `Se descargaron los primeros ${number.format(all.length)} de ${number.format(page.total)} (el máximo por archivo).`
                : `Se descargó el reporte de ${number.format(all.length)} inscripciones.`,
            );
            this.exporting.set(false);
          },
          error: (error: unknown) => {
            this.error.set(apiErrorMessage(error, 'No pudimos preparar la descarga.'));
            this.exporting.set(false);
          },
        });
    };

    next(0);
  }

  private exportRatings(stamp: string): void {
    const report = this.ratings();

    if (!report) {
      return;
    }

    downloadCsv(
      `resenas-${stamp}`,
      toCsv(
        ['Fecha', 'Curso', 'Estudiante', 'Estrellas', 'Comentario'],
        report.recent.map((review) => [
          review.createdAt.slice(0, 10),
          review.course.title,
          review.student,
          review.rating,
          review.comment,
        ]),
      ),
    );
    this.notice.set(`Se descargaron las ${report.recent.length} reseñas más recientes.`);
  }
}
