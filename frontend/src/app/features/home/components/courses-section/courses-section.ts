import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Course as ApiCourse } from '../../../../core/courses/courses.models';
import { CourseCard } from '../course-card/course-card';
import { toCardCourse } from './course-mapper';

/** Catálogo de cursos publicados. Lo ve cualquiera, con o sin sesión. */
@Component({
  selector: 'app-courses-section',
  imports: [CourseCard],
  templateUrl: './courses-section.html',
  styleUrl: './courses-section.scss',
})
export class CoursesSection {
  private readonly router = inject(Router);

  readonly courses = input.required<ApiCourse[]>();
  readonly loading = input(false);
  readonly error = input('');

  /** Nombre de la categoría elegida; null = todas. */
  readonly category = signal<string | null>(null);
  readonly notice = signal('');

  private readonly cards = computed(() => this.courses().map((course) => toCardCourse(course)));

  /** Categorías que realmente tienen cursos. */
  readonly categories = computed(() =>
    [...new Set(this.cards().map((card) => card.category))].sort((a, b) => a.localeCompare(b)),
  );

  readonly visible = computed(() => {
    const selected = this.category();

    return selected ? this.cards().filter((card) => card.category === selected) : this.cards();
  });

  choose(category: string | null): void {
    this.notice.set('');
    this.category.set(category);
  }

  view(id: string): void {
    void this.router.navigate(['/courses', id]);
  }
}
