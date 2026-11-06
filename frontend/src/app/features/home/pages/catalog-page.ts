import { Component, DestroyRef, computed, inject, signal } from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CoursesSection } from '../components/courses-section/courses-section';

import { CoursesService } from '../../../core/courses/courses.service';

import { Course } from '../../../core/courses/courses.models';

@Component({
  selector: 'app-catalog-page',

  imports: [CoursesSection],

  templateUrl: './catalog-page.html',
  styleUrl: './home-page.scss',
})
export class CatalogPage {
  private readonly coursesService = inject(CoursesService);

  private readonly destroyRef = inject(DestroyRef);

  readonly courses = signal<Course[]>([]);

  readonly coursesLoading = signal(true);

  readonly coursesError = signal('');

  /** Cuántos cursos hay en total en el catálogo (el servidor los entrega por páginas). */
  readonly total = signal(0);

  readonly loadingMore = signal(false);

  readonly moreError = signal('');

  private page = 1;

  readonly hasMore = computed(() => this.courses().length < this.total());

  constructor() {
    this.loadCourses();
  }

  private loadCourses(): void {
    this.coursesLoading.set(true);
    this.coursesError.set('');

    this.coursesService
      .getCourses()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.courses.set(response.data);
          this.total.set(response.total);

          this.coursesLoading.set(false);
        },

        error: () => {
          this.coursesError.set('No pudimos cargar los cursos en este momento.');

          this.coursesLoading.set(false);
        },
      });
  }

  /** Pide la siguiente página y la agrega al final, sin repetir cursos que ya se ven. */
  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;

    this.loadingMore.set(true);
    this.moreError.set('');

    this.coursesService
      .getCourses(this.page + 1)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const seen = new Set(this.courses().map((course) => course.id));

          this.page += 1;
          this.total.set(response.total);
          this.courses.update((list) => [
            ...list,
            ...response.data.filter((course) => !seen.has(course.id)),
          ]);
          this.loadingMore.set(false);
        },

        error: () => {
          this.moreError.set('No pudimos cargar más cursos. Intenta de nuevo.');
          this.loadingMore.set(false);
        },
      });
  }
}
