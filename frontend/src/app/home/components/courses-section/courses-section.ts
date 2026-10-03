import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { Course as ApiCourse } from '../../../core/courses/courses.models';
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
  private readonly auth = inject(AuthService);

  readonly courses = input.required<ApiCourse[]>();
  readonly loading = input(false);
  readonly error = input('');

  /** Nombre de la categoría elegida; null = todas. */
  readonly category = signal<string | null>(null);
  readonly notice = signal('');

  private readonly cards = computed(() =>
    this.courses().map((course) => toCardCourse(course)),
  );

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

  /** Sin sesión, invita a entrar; con sesión aún no hay página de detalle. */
  view(): void {
    if (!this.auth.user()) {
      void this.router.navigate(['/login']);
      return;
    }

    this.notice.set('El detalle de cada curso estará disponible muy pronto.');
  }
}
