import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { PageHeader } from '../page-header/page-header';

/**
 * Página provisional para rutas cuya pantalla aún no existe.
 * Lee de `data` de la ruta: title, description y, opcional, backTo / backLabel.
 */
@Component({
  selector: 'app-coming-soon',
  imports: [PageHeader, RouterLink],
  template: `
    <section class="panel-page">
      <div class="panel-container">
        <app-page-header [title]="title" subtitle="Esta sección está en construcción." />

        <div class="panel-card empty">
          @if (description) {
            <p>{{ description }}</p>
          }
          <p class="panel-muted">Pronto podrás usarla desde aquí.</p>
          <a class="panel-btn panel-btn--ghost" [routerLink]="backTo">{{ backLabel }}</a>
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
      max-width: 640px;
      margin: 0;
    }
  `,
})
export class ComingSoon {
  private readonly data = inject(ActivatedRoute).snapshot.data as Record<string, string | undefined>;

  readonly title = this.data['title'] ?? 'Próximamente';
  readonly description = this.data['description'] ?? '';
  readonly backTo = this.data['backTo'] ?? '/';
  readonly backLabel = this.data['backLabel'] ?? 'Volver al inicio';
}
