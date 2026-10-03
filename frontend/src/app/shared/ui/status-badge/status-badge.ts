import { Component, computed, input } from '@angular/core';

export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

const LABELS: Record<CourseStatus, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Archivado',
};

@Component({
  selector: 'app-status-badge',
  template: `<span class="badge" [class]="'badge ' + tone()">{{ label() }}</span>`,
  styles: `
    :host {
      display: inline-block;
    }

    .badge {
      display: inline-block;
      padding: 4px 10px;

      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.02em;

      border-radius: 999px;
    }

    .draft {
      color: var(--p-warn);
      background: var(--p-warn-soft);
    }

    .published {
      color: var(--p-ok);
      background: var(--p-ok-soft);
    }

    .archived {
      color: var(--p-muted);
      background: var(--p-surface-2);
    }
  `,
})
export class StatusBadge {
  readonly status = input.required<CourseStatus>();

  readonly label = computed(() => LABELS[this.status()]);
  readonly tone = computed(() => this.status().toLowerCase());
}
