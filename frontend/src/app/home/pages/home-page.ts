import {
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';

import {
  takeUntilDestroyed,
} from '@angular/core/rxjs-interop';

import {
  Hero,
} from '../components/hero/hero';

import {
  LearningJourney,
} from '../components/learning-journey/learning-journey';

import {
  CategoriesExplorer,
} from '../components/categories-explorer/categories-explorer';

import {
  CoursesService,
} from '../../core/courses/courses.service';

import {
  Course,
} from '../../core/courses/courses.models';

@Component({
  selector: 'app-home-page',

  imports: [
    Hero,
    LearningJourney,
    CategoriesExplorer,
  ],

  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  private readonly coursesService =
    inject(CoursesService);

  private readonly destroyRef =
    inject(DestroyRef);

  readonly courses =
    signal<Course[]>([]);

  readonly coursesLoading =
    signal(true);

  readonly coursesError =
    signal('');

  constructor() {
    this.loadCourses();
  }

  private loadCourses(): void {
    this.coursesLoading.set(true);
    this.coursesError.set('');

    this.coursesService
      .getCourses()
      .pipe(
        takeUntilDestroyed(
          this.destroyRef,
        ),
      )
      .subscribe({
        next: (response) => {
          this.courses.set(
            response.data,
          );

          this.coursesLoading.set(
            false,
          );
        },

        error: () => {
          this.coursesError.set(
            'No pudimos cargar los cursos en este momento.',
          );

          this.coursesLoading.set(
            false,
          );
        },
      });
  }
}