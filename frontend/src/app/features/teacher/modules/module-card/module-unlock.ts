import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';

import { apiErrorMessage } from '../../../../core/http/api-error';
import { Icon } from '../../../../shared/ui/icon/icon';
import { isoToLocalInput, localInputToIso } from '../../assignments/due-date';
import { CourseModule, DripType, ModuleInput } from '../modules.models';
import { TeacherModulesService } from '../modules.service';

/**
 * Cuándo se abre un módulo, según el modo del curso: una fecha, unos días después de inscribirse
 * o al terminar otros módulos. Se ve como un resumen y se edita con el botón «Apertura».
 */
@Component({
  selector: 'app-module-unlock',
  imports: [DatePipe, Icon],
  templateUrl: './module-unlock.html',
  styleUrl: './module-unlock.scss',
})
export class ModuleUnlock {
  private readonly api = inject(TeacherModulesService);

  readonly courseModule = input.required<CourseModule>();
  readonly mode = input.required<DripType>();
  /** Todos los módulos del curso (para elegir requisitos y nombrarlos). */
  readonly siblings = input.required<CourseModule[]>();
  readonly index = input.required<number>();

  readonly saved = output<void>();

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  // Borradores del formulario
  readonly date = signal('');
  readonly days = signal('');
  readonly required = signal<number[]>([]);

  /** Los demás módulos: un módulo no puede pedirse a sí mismo. */
  readonly others = computed(() => this.siblings().filter((m) => m.id !== this.courseModule().id));

  /** Qué configuración tiene hoy, en palabras. */
  readonly summary = computed(() => {
    const module = this.courseModule();

    switch (this.mode()) {
      case 'BY_DATE':
        return module.unlockAt ? { kind: 'date' as const } : { kind: 'open' as const };
      case 'AFTER_DAYS':
        return module.unlockAfterDays !== null && module.unlockAfterDays !== undefined
          ? { kind: 'days' as const }
          : { kind: 'open' as const };
      case 'PREREQUISITES':
        return (module.requiresModuleIds ?? []).length > 0
          ? { kind: 'requires' as const }
          : { kind: 'open' as const };
      case 'SEQUENTIAL':
        return this.index() === 0
          ? { kind: 'first' as const }
          : { kind: 'after-previous' as const };
      default:
        return { kind: 'open' as const };
    }
  });

  readonly requiredTitles = computed(() => {
    const ids = new Set(this.courseModule().requiresModuleIds ?? []);

    return this.siblings()
      .filter((module) => ids.has(module.id))
      .map((module) => module.title);
  });

  readonly previousTitle = computed(() => this.siblings()[this.index() - 1]?.title ?? '');

  /** Solo tienen ajustes los modos por fecha, por días y con requisitos. */
  readonly configurable = computed(() =>
    ['BY_DATE', 'AFTER_DAYS', 'PREREQUISITES'].includes(this.mode()),
  );

  start(): void {
    const module = this.courseModule();

    this.date.set(isoToLocalInput(module.unlockAt ?? null));
    this.days.set(
      module.unlockAfterDays === null || module.unlockAfterDays === undefined
        ? ''
        : String(module.unlockAfterDays),
    );
    this.required.set([...(module.requiresModuleIds ?? [])]);
    this.error.set('');
    this.editing.set(true);
  }

  cancel(): void {
    this.editing.set(false);
  }

  toggle(id: number, checked: boolean): void {
    this.required.update((list) =>
      checked ? [...new Set([...list, id])] : list.filter((item) => item !== id),
    );
  }

  isRequired(id: number): boolean {
    return this.required().includes(id);
  }

  clear(): void {
    this.date.set('');
    this.days.set('');
    this.required.set([]);
  }

  save(): void {
    this.error.set('');

    let input: ModuleInput;

    switch (this.mode()) {
      case 'BY_DATE': {
        const iso = localInputToIso(this.date());

        if (this.date().trim() && iso === null) {
          this.error.set('La fecha no es válida.');
          return;
        }

        input = { unlockAt: iso };
        break;
      }
      case 'AFTER_DAYS': {
        const text = this.days().trim();
        const days = Number(text);

        if (text !== '' && (!Number.isInteger(days) || days < 0 || days > 3650)) {
          this.error.set('Escribe un número entero de días, de 0 a 3650.');
          return;
        }

        input = { unlockAfterDays: text === '' ? null : days };
        break;
      }
      default:
        input = { requiresModuleIds: this.required() };
    }

    this.saving.set(true);

    this.api.update(this.courseModule().id, input).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(false);
        this.saved.emit();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        // El servidor explica los círculos («A pide B y B pide A»).
        this.error.set(apiErrorMessage(error, 'No pudimos guardar la apertura del módulo.'));
      },
    });
  }
}
