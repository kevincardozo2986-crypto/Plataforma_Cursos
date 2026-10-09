import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../../core/http/api-error';
import {
  GradingService,
  SubmissionRow,
  SubmissionStatus,
} from '../../../core/grading/grading.service';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { TeacherCourse } from '../courses/teacher-courses.models';
import { TeacherCoursesService } from '../courses/teacher-courses.service';

type Filter = SubmissionStatus | 'ALL';

const PAGE_SIZE = 20;

/** Entregas de tareas de los estudiantes, para revisarlas y calificarlas. */
@Component({
  selector: 'app-submissions-page',
  imports: [RouterLink, DatePipe, PageHeader],
  templateUrl: './submissions-page.html',
  styleUrl: './grading-list.scss',
})
export class SubmissionsPage {
  private readonly api = inject(GradingService);
  private readonly coursesApi = inject(TeacherCoursesService);

  readonly filters: { value: Filter; label: string }[] = [
    { value: 'SUBMITTED', label: 'Por calificar' },
    { value: 'GRADED', label: 'Calificadas' },
    { value: 'ALL', label: 'Todas' },
  ];

  readonly courses = signal<TeacherCourse[]>([]);
  readonly items = signal<SubmissionRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly filter = signal<Filter>('SUBMITTED');
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
      .submissions({
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
          this.error.set(apiErrorMessage(error, 'No pudimos cargar las entregas.'));
          this.loading.set(false);
        },
      });
  }
}
