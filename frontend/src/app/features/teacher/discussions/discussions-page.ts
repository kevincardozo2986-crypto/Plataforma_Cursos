import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../../core/http/api-error';
import { Discussion, DiscussionsService } from '../../../core/discussions/discussions.service';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { TeacherCourse } from '../courses/teacher-courses.models';
import { TeacherCoursesService } from '../courses/teacher-courses.service';

type View = 'PENDING' | 'QUESTIONS' | 'COMMENTS' | 'ALL';

const PAGE_SIZE = 20;

/** Cada vista del filtro, traducida a lo que pide el backend. */
const VIEWS: {
  value: View;
  label: string;
  query: { kind: 'QUESTION' | 'COMMENT' | null; answered: false | null };
}[] = [
  { value: 'PENDING', label: 'Sin responder', query: { kind: 'QUESTION', answered: false } },
  { value: 'QUESTIONS', label: 'Preguntas', query: { kind: 'QUESTION', answered: null } },
  {
    value: 'COMMENTS',
    label: 'Comentarios de lección',
    query: { kind: 'COMMENT', answered: null },
  },
  { value: 'ALL', label: 'Todo', query: { kind: null, answered: null } },
];

/** Bandeja de preguntas y comentarios de los estudiantes en los cursos del docente. */
@Component({
  selector: 'app-discussions-page',
  imports: [RouterLink, DatePipe, PageHeader],
  templateUrl: './discussions-page.html',
  styleUrl: './discussions-page.scss',
})
export class DiscussionsPage {
  private readonly api = inject(DiscussionsService);
  private readonly coursesApi = inject(TeacherCoursesService);

  readonly views = VIEWS;

  readonly courses = signal<TeacherCourse[]>([]);
  readonly items = signal<Discussion[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly view = signal<View>('PENDING');
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

  setView(view: View): void {
    this.view.set(view);
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

  /** Los comentarios no tienen título: se muestra el comienzo del texto. */
  headline(item: Discussion): string {
    if (item.title) {
      return item.title;
    }

    return item.body.length > 90 ? `${item.body.slice(0, 90).trimEnd()}…` : item.body;
  }

  private load(): void {
    const { kind, answered } = VIEWS.find((entry) => entry.value === this.view())!.query;

    this.loading.set(true);
    this.error.set('');

    this.api
      .list({
        kind,
        answered,
        courseId: this.courseFilter(),
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
          this.error.set(apiErrorMessage(error, 'No pudimos cargar las discusiones.'));
          this.loading.set(false);
        },
      });
  }
}
