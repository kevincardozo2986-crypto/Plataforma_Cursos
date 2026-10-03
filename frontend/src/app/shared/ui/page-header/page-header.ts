import { Component, input } from '@angular/core';

/** Título de página con subtítulo y espacio (ng-content) para los botones de acción. */
@Component({
  selector: 'app-page-header',
  template: `
    <header class="page-header">
      <div class="copy">
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <p>{{ subtitle() }}</p>
        }
      </div>

      <div class="actions">
        <ng-content />
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: 24px;
    }

    .page-header {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
    }

    h1 {
      margin: 0;

      color: var(--p-ink);
      font-size: clamp(1.6rem, 3vw, 2.1rem);
      line-height: 1.15;
      letter-spacing: -0.02em;
    }

    p {
      margin: 6px 0 0;

      color: var(--p-muted);
      font-size: 0.95rem;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
