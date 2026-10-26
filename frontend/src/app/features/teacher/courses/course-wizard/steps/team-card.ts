import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../../../core/http/api-error';
import { Icon } from '../../../../../shared/ui/icon/icon';

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  addedAt?: string;
}

interface Team {
  owner: Member;
  instructors: Member[];
}

const MAX_INSTRUCTORS = 10;

/**
 * Equipo docente de un curso: el autor y hasta 10 instructores que lo gestionan con él. El autor
 * agrega y quita instructores por correo; un instructor puede salirse del curso.
 */
@Component({
  selector: 'app-team-card',
  imports: [FormsModule, Icon],
  template: `
    <section class="wz-card tone-blue" aria-labelledby="team-title">
      <header class="wz-head">
        <span class="wz-icon" aria-hidden="true"><app-icon name="users" [size]="19" /></span>
        <div>
          <h2 id="team-title">Equipo docente</h2>
          <p>Los instructores gestionan el curso contigo: contenido, calificaciones y anuncios.</p>
        </div>
      </header>

      @if (loading()) {
        <p class="muted"><app-icon name="refresh" [size]="15" /> Cargando equipo…</p>
      } @else if (team(); as data) {
        <ul class="members">
          <li class="member">
            <span class="avatar" aria-hidden="true">{{ initials(data.owner) }}</span>
            <span class="who">
              <strong>{{ data.owner.firstName }} {{ data.owner.lastName }}</strong>
              <small>{{ data.owner.email }}</small>
            </span>
            <span class="role owner">Autor</span>
          </li>

          @for (member of data.instructors; track member.id) {
            <li class="member">
              <span class="avatar" aria-hidden="true">{{ initials(member) }}</span>
              <span class="who">
                <strong>{{ member.firstName }} {{ member.lastName }}</strong>
                <small>{{ member.email }}</small>
              </span>
              <span class="role">Instructor</span>

              @if (isOwner()) {
                @if (confirmId() === member.id) {
                  <span class="confirm">¿Quitar?</span>
                  <button
                    type="button"
                    class="mini danger"
                    [disabled]="busy()"
                    (click)="remove(member)"
                  >
                    Sí
                  </button>
                  <button type="button" class="mini" (click)="confirmId.set(null)">No</button>
                } @else {
                  <button
                    type="button"
                    class="icon"
                    [attr.aria-label]="'Quitar a ' + member.firstName"
                    title="Quitar del equipo"
                    (click)="confirmId.set(member.id)"
                  >
                    <app-icon name="x" [size]="16" />
                  </button>
                }
              } @else if (isMe(member)) {
                @if (confirmId() === member.id) {
                  <span class="confirm">¿Salirte del curso?</span>
                  <button
                    type="button"
                    class="mini danger"
                    [disabled]="busy()"
                    (click)="leave(member)"
                  >
                    Sí
                  </button>
                  <button type="button" class="mini" (click)="confirmId.set(null)">No</button>
                } @else {
                  <button type="button" class="mini danger" (click)="confirmId.set(member.id)">
                    Salirme
                  </button>
                }
              }
            </li>
          } @empty {
            <li class="empty">
              <app-icon name="info" [size]="15" /> Todavía eres la única persona que gestiona este
              curso.
            </li>
          }
        </ul>

        @if (isOwner()) {
          <form class="add" novalidate (submit)="$event.preventDefault(); add()">
            <label for="team-email">Agregar un instructor por su correo</label>
            <div class="row">
              <input
                id="team-email"
                class="panel-input"
                type="email"
                name="email"
                autocomplete="off"
                placeholder="docente@universidad.edu.co"
                [ngModel]="email()"
                (ngModelChange)="email.set($event)"
                [disabled]="busy() || !canAdd()"
              />
              <button
                type="submit"
                class="panel-btn panel-btn--primary"
                [disabled]="busy() || !canAdd()"
              >
                <app-icon name="plus" [size]="16" /> Agregar
              </button>
            </div>
            <p class="hint">
              Debe tener una cuenta de docente activa. Le llegará una notificación.
              {{ data.instructors.length }} de {{ max }}.
            </p>
          </form>
        } @else {
          <p class="hint">Solo el autor del curso puede agregar o quitar instructores.</p>
        }
      }

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="ok" role="status"><app-icon name="check-circle" [size]="15" /> {{ notice() }}</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .muted,
    .hint {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      color: var(--p-muted);
      font-size: 0.8rem;
    }

    .members {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .member {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      background: var(--p-surface-2);
      border: 1px solid var(--p-border);
      border-radius: 10px;
    }

    .avatar {
      display: grid;
      flex: none;
      place-items: center;
      width: 34px;
      height: 34px;
      color: var(--p-accent);
      font-size: 0.74rem;
      font-weight: 800;
      background: var(--p-accent-soft);
      border-radius: 50%;
    }

    .who {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
    }

    .who strong,
    .who small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .who small {
      color: var(--p-muted);
      font-size: 0.74rem;
    }

    .role {
      flex: none;
      padding: 2px 9px;
      color: var(--p-muted);
      font-size: 0.7rem;
      font-weight: 700;
      background: var(--p-surface);
      border-radius: 999px;
    }

    .role.owner {
      color: var(--p-accent);
      background: var(--p-accent-soft);
    }

    .icon,
    .mini {
      color: var(--p-ink);
      font: inherit;
      font-size: 0.78rem;
      font-weight: 650;
      background: var(--p-surface);
      border: 1px solid var(--p-border);
      border-radius: 8px;
      cursor: pointer;
    }

    .icon {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      color: var(--p-danger);
    }

    .mini {
      padding: 4px 10px;
    }

    .danger {
      color: var(--p-danger);
    }

    .confirm {
      color: var(--p-danger);
      font-size: 0.78rem;
      font-weight: 650;
    }

    .empty {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      color: var(--p-muted);
      font-size: 0.84rem;
      background: var(--p-surface-2);
      border: 1px dashed var(--p-border);
      border-radius: 10px;
    }

    .add {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .add label {
      font-size: 0.86rem;
      font-weight: 650;
    }

    .row {
      display: flex;
      gap: 8px;
    }

    .row .panel-input {
      flex: 1;
      min-width: 0;
    }

    .panel-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .error {
      margin: 0;
      color: var(--p-danger);
      font-size: 0.84rem;
    }

    .ok {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      color: var(--p-ok);
      font-size: 0.84rem;
    }
  `,
})
export class TeamCard {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly courseId = input.required<number>();
  /** false si el docente solo es instructor: no agrega ni quita, solo puede salirse. */
  readonly isOwner = input(true);

  readonly team = signal<Team | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly email = signal('');
  readonly confirmId = signal<number | null>(null);

  readonly max = MAX_INSTRUCTORS;
  readonly me = this.auth.user;
  readonly canAdd = computed(() => (this.team()?.instructors.length ?? 0) < MAX_INSTRUCTORS);

  constructor() {
    // El curso llega como entrada: se carga cuando ya está disponible.
    effect(() => {
      const id = this.courseId();

      untracked(() => this.load(id));
    });
  }

  /** ¿Es la persona que tiene la sesión? (la sesión guarda el correo, no el id) */
  isMe(member: Member): boolean {
    return member.email.toLowerCase() === (this.me()?.email ?? '').toLowerCase();
  }

  initials(member: Member): string {
    return ((member.firstName[0] ?? '') + (member.lastName[0] ?? '')).toUpperCase();
  }

  private load(courseId: number): void {
    this.http.get<Team>(`/api/courses/${courseId}/instructors`).subscribe({
      next: (team) => {
        this.team.set(team);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos cargar el equipo docente.'));
        this.loading.set(false);
      },
    });
  }

  add(): void {
    const email = this.email().trim();

    this.error.set('');
    this.notice.set('');

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      this.error.set('Escribe un correo válido.');
      return;
    }

    this.busy.set(true);

    this.http.post<Team>(`/api/courses/${this.courseId()}/instructors`, { email }).subscribe({
      next: (team) => {
        this.team.set(team);
        this.email.set('');
        this.notice.set('Instructor agregado. Ya puede gestionar el curso.');
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos agregar al instructor.'));
        this.busy.set(false);
      },
    });
  }

  remove(member: Member): void {
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);

    this.http.delete<Team>(`/api/courses/${this.courseId()}/instructors/${member.id}`).subscribe({
      next: (team) => {
        this.team.set(team);
        this.confirmId.set(null);
        this.notice.set(`${member.firstName} ya no está en el equipo.`);
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos quitar al instructor.'));
        this.confirmId.set(null);
        this.busy.set(false);
      },
    });
  }

  /** Un instructor se sale del curso: pierde el acceso, así que vuelve a «Mis cursos». */
  leave(member: Member): void {
    this.busy.set(true);

    this.http.delete(`/api/courses/${this.courseId()}/instructors/${member.id}`).subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigate(['/teacher/courses']);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos sacarte del curso.'));
        this.confirmId.set(null);
        this.busy.set(false);
      },
    });
  }
}
