import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { apiErrorMessage } from '../../../core/http/api-error';
interface Reply {
  id: number;
  body: string;
  author?: { firstName: string; lastName: string; role?: string };
}
@Component({
  selector: 'app-question-thread',
  imports: [FormsModule],
  template: `
    <button class="toggle" [attr.aria-expanded]="expanded()" (click)="toggle()">
      {{ expanded() ? 'Ocultar conversación' : 'Ver respuestas y participar' }}
    </button>
    @if (expanded()) {
      <div class="thread">
        @if (loading()) {
          <p role="status">Cargando respuestas...</p>
        } @else {
          @for (reply of replies(); track reply.id) {
            <article>
              <strong>{{ reply.author?.firstName }} {{ reply.author?.lastName }}</strong>
              @if (reply.author?.role === 'TEACHER' || reply.author?.role === 'ADMIN') {
                <small>Docente</small>
              }
              <p>{{ reply.body }}</p>
            </article>
          } @empty {
            <p class="empty">Aún no hay respuestas. Puedes añadir información a la pregunta.</p>
          }
          <form #form="ngForm" (ngSubmit)="send()">
            <label [for]="'reply-' + postId()">Tu respuesta</label
            ><textarea
              [id]="'reply-' + postId()"
              name="body"
              [(ngModel)]="body"
              required
              maxlength="5000"
              rows="3"
              placeholder="Participa con respeto y comparte lo que sabes..."
            ></textarea
            ><button [disabled]="form.invalid || saving()">
              {{ saving() ? 'Enviando...' : 'Enviar respuesta' }}
            </button>
          </form>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
          <button class="toggle" (click)="load()">Volver a cargar</button>
        }
      </div>
    }
  `,
  styles: `
    .toggle {
      border: 0;
      background: transparent;
      color: #1265ed;
      font: inherit;
      font-size: 0.74rem;
      cursor: pointer;
      padding: 10px 0;
    }
    .thread {
      margin-top: 8px;
      padding: 14px;
      border: 1px solid var(--border, #e1eaf6);
      border-radius: 12px;
    }
    article {
      padding: 12px 0;
      border-bottom: 1px solid var(--border, #e1eaf6);
    }
    strong {
      font-size: 0.75rem;
    }
    small {
      margin-left: 8px;
      color: #1265ed;
      font-size: 0.65rem;
    }
    p {
      font-size: 0.78rem;
      line-height: 1.7;
      white-space: pre-wrap;
      margin: 8px 0;
    }
    .empty {
      color: var(--muted, #647a9d);
    }
    label {
      display: block;
      font-size: 0.75rem;
      margin: 16px 0 8px;
    }
    textarea {
      box-sizing: border-box;
      width: 100%;
      padding: 12px;
      border: 1px solid var(--border, #e1eaf6);
      border-radius: 10px;
      background: var(--surface, #fff);
      color: inherit;
      font: inherit;
      font-size: 0.8rem;
      resize: vertical;
    }
    form button {
      margin-top: 12px;
      padding: 10px 14px;
      border: 0;
      border-radius: 10px;
      background: #1265ed;
      color: #fff;
      font: inherit;
      font-size: 0.74rem;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.5;
    }
    button:focus-visible,
    textarea:focus-visible {
      outline: 3px solid #2279ff;
      outline-offset: 3px;
    }
    .error {
      color: #bc3447;
    }
  `,
})
export class QuestionThread {
  readonly postId = input.required<number>();
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly expanded = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly replies = signal<Reply[]>([]);
  readonly error = signal('');
  body = '';
  toggle(): void {
    this.expanded.update((value) => !value);
    if (this.expanded()) this.load();
  }
  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.http
      .get<{ replies: Reply[] }>('/api/discussions/' + this.postId())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (post) => this.replies.set(post.replies),
        error: (error) =>
          this.error.set(apiErrorMessage(error, 'No pudimos cargar las respuestas.')),
      });
  }
  send(): void {
    if (this.saving() || !this.body.trim()) return;
    this.saving.set(true);
    this.error.set('');
    this.http
      .post<Reply>('/api/discussions/' + this.postId() + '/replies', { body: this.body.trim() })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (reply) => {
          this.replies.update((items) => [...items, reply]);
          this.body = '';
        },
        error: (error) => this.error.set(apiErrorMessage(error, 'No pudimos enviar tu respuesta.')),
      });
  }
}
