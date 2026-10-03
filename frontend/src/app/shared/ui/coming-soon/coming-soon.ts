import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { PageHeader } from '../page-header/page-header';

/** Página provisional para rutas cuya pantalla aún no existe. Toma el título de `data.title`. */
@Component({
  selector: 'app-coming-soon',
  imports: [PageHeader, RouterLink],
  template: `
    <section class="panel-page">
      <div class="panel-container">
        <app-page-header [title]="title" subtitle="Esta sección está en construcción." />

        <div class="panel-card empty">
          <p class="panel-muted">Pronto podrás gestionar esto desde aquí.</p>
          <a class="panel-btn panel-btn--ghost" routerLink="/">Volver al inicio</a>
        </div>
      </div>
    </section>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 14px;
    }

    p {
      margin: 0;
    }
  `,
})
export class ComingSoon {
  readonly title = (inject(ActivatedRoute).snapshot.data['title'] as string | undefined) ?? 'Próximamente';
}
