import { DatePipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';

export interface RoadmapRequirement {
  type: 'lesson' | 'evaluation' | 'assignment';
  id: number;
  title: string;
  done: boolean;
  dueAt: string | null;
}

export interface RoadmapModuleState {
  moduleId: number;
  locked: boolean;
  requirements?: RoadmapRequirement[];
}

export interface RoadmapTarget {
  type: 'evaluation' | 'assignment';
  id: number;
}

/**
 * «Tu ruta»: dice en qué módulo estás, qué te falta para abrir el siguiente y cuál es el próximo
 * paso (una lección, una evaluación o una tarea), con un botón que te lleva directo ahí.
 */
@Component({
  selector: 'app-course-roadmap',
  imports: [TranslatePipe, DatePipe],
  template: `
    @if (focus(); as f) {
      <section class="roadmap" [attr.aria-label]="'Tu ruta en el curso' | t">
        <div class="head">
          <div class="where">
            <small>{{ 'Módulo' | t }} {{ f.index + 1 }} {{ 'de' | t }} {{ modules().length }}</small>
            <strong>{{ f.title }}</strong>
          </div>
          <div class="meter" role="img" [attr.aria-label]="f.done + ' / ' + f.total">
            <span [style.width.%]="f.percent"></span>
          </div>
          <small class="count">{{ f.done }}/{{ f.total }} {{ 'completados' | t }} · {{ 'faltan' | t }} {{ f.total - f.done }}</small>
          @if (f.next; as next) {
            <button type="button" class="go" (click)="go(next)">
              <small>{{ 'Siguiente paso' | t }}</small>
              <span>{{ kind(next) | t }}: {{ next.title }}</span>
            </button>
          }
        </div>

        <button type="button" class="toggle" (click)="open.set(!open())" [attr.aria-expanded]="open()">
          {{ open() ? ('Ocultar lo que falta' | t) : ('Ver todo lo que se pide en este módulo' | t) }}
        </button>

        @if (open()) {
          <p class="rule">
            @if (f.nextTitle) {
              {{ 'Para abrir el siguiente módulo' | t }} («{{ f.nextTitle }}») {{ 'debes completar todo esto:' | t }}
            } @else {
              {{ 'Para terminar el curso debes completar todo esto:' | t }}
            }
          </p>
          <ul class="steps">
            @for (item of f.items; track item.type + item.id) {
              <li [class.done]="item.done">
                <button type="button" (click)="go(item)">
                  <span class="mark" aria-hidden="true">{{ item.done ? '✓' : '' }}</span>
                  <span class="kind">{{ kind(item) | t }}</span>
                  <span class="name">{{ item.title }}</span>
                  @if (item.dueAt && !item.done) {
                    <small [class.late]="isLate(item.dueAt)">
                      {{ isLate(item.dueAt) ? ('Vencida' | t) : ('Vence' | t) }}
                      {{ item.dueAt | date: 'd MMM, h:mm a' }}
                    </small>
                  }
                  <small class="state">{{ item.done ? ('Listo' | t) : ('Pendiente' | t) }}</small>
                </button>
              </li>
            }
          </ul>
          @if (f.nextTitle) {
            <p class="after">🔒 {{ 'El siguiente módulo se abre cuando termines todo lo anterior.' | t }}</p>
          }
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      flex-shrink: 0;
      max-height: 55%;
      overflow: auto;
    }
    .roadmap {
      padding: 14px 18px;
      margin-bottom: 14px;
      color: #12304f;
      background: #fff;
      border: 1px solid #cfe0f7;
      border-left: 5px solid #1463d8;
      border-radius: 14px;
      box-shadow: 0 4px 14px rgba(20, 60, 120, 0.07);
    }
    .roadmap.finished {
      display: flex;
      flex-direction: column;
      gap: 2px;
      background: #effaf3;
      border-left-color: #17a35a;
    }
    .head {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 18px;
      align-items: center;
    }
    .where {
      display: flex;
      flex: 1 1 200px;
      flex-direction: column;
      min-width: 160px;
    }
    .where small,
    .go small,
    .count {
      color: #60738d;
      font-size: 0.72rem;
      font-weight: 650;
    }
    .where strong {
      font-size: 1rem;
    }
    .meter {
      flex: 1 1 140px;
      height: 8px;
      overflow: hidden;
      background: #e1eaf6;
      border-radius: 999px;
    }
    .meter span {
      display: block;
      height: 100%;
      background: #17a35a;
      transition: width 0.3s;
    }
    .go {
      display: flex;
      flex-direction: column;
      gap: 1px;
      align-items: flex-start;
      max-width: 100%;
      padding: 9px 16px;
      color: #fff;
      text-align: left;
      cursor: pointer;
      background: #1463d8;
      border: 0;
      border-radius: 10px;
    }
    .go small {
      color: #cfe2ff;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .go span {
      font-size: 0.9rem;
      font-weight: 700;
    }
    .go:hover {
      background: #0f52b8;
    }
    .toggle {
      padding: 8px 0 0;
      color: #1463d8;
      font-size: 0.8rem;
      font-weight: 650;
      cursor: pointer;
      background: none;
      border: 0;
    }
    .rule {
      margin: 10px 0 6px;
      font-size: 0.82rem;
      font-weight: 650;
    }
    .steps {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 0;
      margin: 0;
      list-style: none;
    }
    .steps button {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 10px;
      align-items: center;
      width: 100%;
      padding: 8px 12px;
      color: inherit;
      text-align: left;
      cursor: pointer;
      background: #f3f7fd;
      border: 1px solid #dbe4ef;
      border-radius: 10px;
    }
    .steps button:hover {
      border-color: #1463d8;
    }
    .mark {
      display: grid;
      flex: none;
      place-items: center;
      width: 22px;
      height: 22px;
      color: #fff;
      font-size: 0.75rem;
      background: #fff;
      border: 2px solid #9db4d3;
      border-radius: 50%;
    }
    .done .mark {
      background: #17a35a;
      border-color: #17a35a;
    }
    .done .name {
      color: #60738d;
      text-decoration: line-through;
    }
    .kind {
      padding: 2px 8px;
      color: #1d4f9c;
      font-size: 0.68rem;
      font-weight: 750;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      background: #dce9fb;
      border-radius: 999px;
    }
    .name {
      flex: 1 1 140px;
      font-size: 0.86rem;
      font-weight: 600;
    }
    .steps small {
      color: #60738d;
      font-size: 0.72rem;
    }
    .steps small.late {
      color: #b3261e;
      font-weight: 700;
    }
    .steps .state {
      font-weight: 700;
    }
    .done .state {
      color: #17703d;
    }
    .after {
      margin: 10px 0 0;
      color: #60738d;
      font-size: 0.8rem;
    }
  `,
})
export class CourseRoadmap {
  readonly modules = input.required<{ id: number; title: string }[]>();
  readonly availability = input.required<RoadmapModuleState[]>();

  readonly lesson = output<number>();
  readonly assessment = output<RoadmapTarget>();

  readonly open = signal(false);

  private readonly states = computed(() =>
    this.modules().map((module, index) => {
      const state = this.availability().find((item) => item.moduleId === module.id);
      const items = state?.requirements ?? [];

      return {
        index,
        id: module.id,
        title: module.title,
        locked: state?.locked ?? true,
        items,
        done: items.filter((item) => item.done).length,
        total: items.length,
      };
    }),
  );

  private readonly hasData = computed(() => this.states().some((state) => state.total > 0));

  /** El primer módulo abierto que todavía tiene algo pendiente. */
  readonly focus = computed(() => {
    const states = this.states();
    const current = states.find((state) => !state.locked && state.done < state.total);

    if (!current || !this.hasData()) return null;

    return {
      ...current,
      percent: Math.round((current.done / current.total) * 100),
      next: current.items.find((item) => !item.done) ?? null,
      nextTitle: states[current.index + 1]?.title ?? null,
    };
  });

  readonly allDone = computed(
    () =>
      this.hasData() && this.states().every((state) => state.total === 0 || state.done === state.total),
  );

  kind(item: RoadmapRequirement): string {
    return item.type === 'lesson' ? 'Lección' : item.type === 'evaluation' ? 'Evaluación' : 'Tarea';
  }

  isLate(dueAt: string): boolean {
    return new Date(dueAt).getTime() < Date.now();
  }

  go(item: RoadmapRequirement): void {
    if (item.type === 'lesson') this.lesson.emit(item.id);
    else this.assessment.emit({ type: item.type, id: item.id });
  }
}
