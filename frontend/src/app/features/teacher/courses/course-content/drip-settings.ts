import { Component, inject, input, output, signal } from '@angular/core';

import { apiErrorMessage } from '../../../../core/http/api-error';
import { Icon, IconName } from '../../../../shared/ui/icon/icon';
import { DRIP_INFO, DRIP_TYPES, DripType } from '../../modules/modules.models';
import { TeacherCoursesService } from '../teacher-courses.service';

const ICONS: Record<DripType, IconName> = {
  NONE: 'eye',
  SEQUENTIAL: 'list',
  BY_DATE: 'calendar',
  AFTER_DAYS: 'clock',
  PREREQUISITES: 'lock',
};

/**
 * Cómo se abre el contenido del curso a los estudiantes (liberación gradual). El modo se guarda
 * al elegirlo; los ajustes de cada módulo (fecha, días o requisitos) se editan en su tarjeta.
 */
@Component({
  selector: 'app-drip-settings',
  imports: [Icon],
  template: `
    <section class="wz-card drip" aria-labelledby="drip-title">
      <header class="wz-head">
        <span class="wz-icon" aria-hidden="true"><app-icon name="calendar" [size]="19" /></span>
        <div>
          <h2 id="drip-title">Cuándo se abre cada módulo</h2>
          <p>
            La liberación gradual: tú decides si todo está abierto o se va abriendo con el tiempo.
          </p>
        </div>
      </header>

      <fieldset class="wz-choices modes">
        <legend class="sr-only">Modo de apertura del contenido</legend>

        @for (type of types; track type) {
          <label class="wz-choice">
            <input
              type="radio"
              name="drip-mode"
              [value]="type"
              [checked]="mode() === type"
              [disabled]="saving()"
              (change)="choose(type)"
            />
            <span class="wz-choice-icon" aria-hidden="true"
              ><app-icon [name]="icons[type]" [size]="17"
            /></span>
            <span>
              <strong>{{ info[type].label }}</strong>
              <small>{{ info[type].hint }}</small>
            </span>
          </label>
        }
      </fieldset>

      @if (mode() === 'BY_DATE' || mode() === 'AFTER_DAYS' || mode() === 'PREREQUISITES') {
        <p class="tip">
          <app-icon name="info" [size]="15" />
          <span>
            Configura cada módulo más abajo, con el botón «Apertura». Un módulo sin ajuste queda
            abierto.
          </span>
        </p>
      } @else if (mode() === 'SEQUENTIAL') {
        <p class="tip">
          <app-icon name="info" [size]="15" />
          <span>No hay nada más que configurar: el orden de los módulos define el camino.</span>
        </p>
      }

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: 18px;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }

    .modes {
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    }

    .tip {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 0;
      padding: 9px 12px;
      color: var(--p-muted);
      font-size: 0.82rem;
      line-height: 1.5;
      background: var(--p-surface-2);
      border-radius: 10px;
    }

    .tip app-icon {
      margin-top: 2px;
      color: var(--p-accent);
    }

    .error {
      margin: 0;
      color: var(--p-danger);
      font-size: 0.86rem;
    }
  `,
})
export class DripSettings {
  private readonly api = inject(TeacherCoursesService);

  readonly courseId = input.required<number>();
  readonly mode = input<DripType>('NONE');
  /** Avisa con el modo ya guardado, para que la página recargue. */
  readonly changed = output<DripType>();

  readonly types = DRIP_TYPES;
  readonly info = DRIP_INFO;
  readonly icons = ICONS;

  readonly saving = signal(false);
  readonly error = signal('');

  choose(type: DripType): void {
    if (type === this.mode()) {
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.api.update(this.courseId(), { dripType: type }).subscribe({
      next: () => {
        this.saving.set(false);
        this.changed.emit(type);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(
          apiErrorMessage(error, 'No pudimos cambiar la forma de abrir el contenido.'),
        );
      },
    });
  }
}
