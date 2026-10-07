import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../../../core/http/api-error';
import { TeacherCoursesService } from '../teacher-courses.service';

/**
 * Entrada del asistente: al abrirse crea de inmediato un curso en borrador y
 * pasa al paso 1, así lo que se escriba ya está guardado en un curso real.
 */
@Component({
  selector: 'app-course-draft-entry',
  imports: [RouterLink],
  template: `
    <section class="panel-page">
      <div class="panel-container">
        @if (error()) {
          <p class="panel-alert panel-alert--error" role="alert">{{ error() }}</p>
          <div class="actions">
            <button type="button" class="panel-btn panel-btn--primary" (click)="create()">
              Reintentar
            </button>
            <a class="panel-btn panel-btn--ghost" routerLink="/teacher/courses"
              >Volver a mis cursos</a
            >
          </div>
        } @else {
          <div class="panel-card">
            <p class="panel-muted" role="status">Preparando tu nuevo curso…</p>
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    p {
      margin: 0;
    }
  `,
})
export class CourseDraftEntry {
  private readonly api = inject(TeacherCoursesService);
  private readonly router = inject(Router);

  readonly error = signal('');

  constructor() {
    this.create();
  }

  create(): void {
    this.error.set('');

    this.api.createDraft().subscribe({
      next: (draft) =>
        // replaceUrl: al volver atrás no se cae otra vez en /new y se crea otro borrador.
        void this.router.navigate(['/teacher/courses', draft.id, 'edit', 'basics'], {
          replaceUrl: true,
        }),
      error: (error: unknown) =>
        this.error.set(apiErrorMessage(error, 'No pudimos crear el borrador del curso.')),
    });
  }
}
