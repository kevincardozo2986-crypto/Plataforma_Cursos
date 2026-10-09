import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../../core/http/api-error';
import { AttemptRow, AttemptStatus, GradingService } from '../../../core/grading/grading.service';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { TeacherCourse } from '../courses/teacher-courses.models';
import { TeacherCoursesService } from '../courses/teacher-courses.service';

type Filter = AttemptStatus | 'ALL';

const PAGE_SIZE = 20;

/** Intentos de quiz presentados por los estudiantes, para revisar las preguntas abiertas. */
@Component({
  selector: 'app-attempts-page',
  imports: [RouterLink, DatePipe, PageHeader],
  templateUrl: './attempts-page.html',
  styleUrl: './grading-list.scss',
})
export class AttemptsPage {
  private readonly api = inject(GradingService);
  private readonly coursesApi = inject(TeacherCoursesService);

  readonly filters: { value: Filter; label: string }[] = [
    { value: 'PENDING_REVIEW', label: 'Por revisar' },
    { value: 'GRADED', label: 'Calificados' },
    { value: 'ALL', label: 'Todos' },
  ];

  readonly courses = signal<TeacherCourse[]>([]);
  readonly items = signal<AttemptRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly filter = signal<Filter>('PENDING_REVIEW');
  readonly courseFilter = signal<number | null>(null);
  readonly offset = signal(0);

  readonly from = computed(() => (this.total() === 0 ? 0 : this.offset() + 1));
  readonly to = computed(() => Math.min(this.offset() + PAGE_SIZE, this.total()));
  readonly hasPrev = computed(() => this.offset() > 0);
  readonly hasNext = computed(() => this.offset() + PAGE_SIZE < this.total());

  constructor() {
    this.coursesApi
      .list()
      .pipe(takeUntilDestroyed())
      .subscribe({ next: (courses) => this.courses.set(courses) });

    this.load();
  }

  setFilter(filter: Filter): void {
    this.filter.set(filter);
    this.offset.set(0);
    this.load();
  }

  setCourse(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    this.courseFilter.set(value ? Number(value) : null);
    this.offset.set(0);
    this.load();
  }

  page(step: 1 | -1): void {
    this.offset.update((value) => Math.max(0, value + step * PAGE_SIZE));
    this.load();
  }

  private load(): void {
    const filter = this.filter();

    this.loading.set(true);
    this.error.set('');

    this.api
      .attempts({
        courseId: this.courseFilter(),
        status: filter === 'ALL' ? null : filter,
        limit: PAGE_SIZE,
        offset: this.offset(),
      })
      .subscribe({
        next: (page) => {
          this.items.set(page.items);
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos cargar los intentos.'));
          this.loading.set(false);
        },
      });
  }
}
