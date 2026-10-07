import { Component, DestroyRef, inject, signal } from '@angular/core';

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

          this.coursesLoading.set(false);
        },

        error: () => {
          this.coursesError.set('No pudimos cargar los cursos en este momento.');

          this.coursesLoading.set(false);
        },
      });
  }
}
