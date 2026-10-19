import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { apiErrorMessage } from '../../../core/http/api-error';
import {
  ReviewsService,
  ReviewSummary,
  TeacherReview,
} from '../../../core/reviews/reviews.service';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { TeacherCourse } from '../courses/teacher-courses.models';
import { TeacherCoursesService } from '../courses/teacher-courses.service';

const PAGE_SIZE = 20;

/** Las estrellas como texto: «★★★★☆». Sirve para la lista; el valor exacto va en un aria-label. */
export function starText(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)));

  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

/** Reseñas que los estudiantes dejaron en los cursos del docente. */
@Component({
  selector: 'app-reviews-page',
  imports: [DatePipe, PageHeader],
  templateUrl: './reviews-page.html',
  styleUrl: './reviews-page.scss',
})
export class ReviewsPage {
  private readonly api = inject(ReviewsService);
  private readonly coursesApi = inject(TeacherCoursesService);

  readonly starText = starText;
  readonly ratings = [5, 4, 3, 2, 1];

  readonly courses = signal<TeacherCourse[]>([]);
  readonly items = signal<TeacherReview[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly courseFilter = signal<number | null>(null);
  readonly ratingFilter = signal<number | null>(null);
  readonly offset = signal(0);

  /** Solo con un curso elegido: su promedio y cómo se reparten las estrellas. */
  readonly summary = signal<ReviewSummary | null>(null);

  readonly from = computed(() => (this.total() === 0 ? 0 : this.offset() + 1));
  readonly to = computed(() => Math.min(this.offset() + PAGE_SIZE, this.total()));
  readonly hasPrev = computed(() => this.offset() > 0);
  readonly hasNext = computed(() => this.offset() + PAGE_SIZE < this.total());

  /** Las barras: la más larga ocupa todo el ancho, el resto en proporción. */
  readonly bars = computed(() => {
    const summary = this.summary();

    if (!summary) {
      return [];
    }

    const most = Math.max(1, ...Object.values(summary.distribution));

    return this.ratings.map((rating) => {
      const count = summary.distribution[String(rating) as '1'];

      return { rating, count, width: (count / most) * 100 };
    });
  });

  constructor() {
    this.coursesApi
      .list()
      .pipe(takeUntilDestroyed())
      .subscribe({ next: (courses) => this.courses.set(courses) });

    this.load();
  }

  setCourse(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    this.courseFilter.set(value ? Number(value) : null);
    this.offset.set(0);
    this.summary.set(null);
    this.load();
    this.loadSummary();
  }

  setRating(rating: number | null): void {
    this.ratingFilter.set(rating);
    this.offset.set(0);
    this.load();
  }

  page(step: 1 | -1): void {
    this.offset.update((value) => Math.max(0, value + step * PAGE_SIZE));
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .list({
        courseId: this.courseFilter(),
        rating: this.ratingFilter(),
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
          this.error.set(apiErrorMessage(error, 'No pudimos cargar las reseñas.'));
          this.loading.set(false);
        },
      });
  }

  private loadSummary(): void {
    const courseId = this.courseFilter();

    if (!courseId) {
      return;
    }

    // Solo hay resumen de cursos publicados; en un borrador responde 404 y simplemente no se muestra.
    this.api.summary(courseId).subscribe({
      next: (summary) => this.summary.set(summary),
      error: () => this.summary.set(null),
    });
  }
}
