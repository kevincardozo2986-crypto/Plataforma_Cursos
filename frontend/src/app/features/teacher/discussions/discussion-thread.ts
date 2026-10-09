import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../../core/http/api-error';
import {
  DiscussionAuthor,
  DiscussionsService,
  DiscussionThread,
  Reply,
} from '../../../core/discussions/discussions.service';

/** Una pregunta o comentario con sus respuestas, para responder y moderar. */
@Component({
  selector: 'app-discussion-thread',
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './discussion-thread.html',
  styleUrl: './discussion-thread.scss',
})
export class DiscussionThreadPage {
  private readonly api = inject(DiscussionsService);
  private readonly router = inject(Router);

  private readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  readonly thread = signal<DiscussionThread | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly sending = signal(false);

  readonly reply = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(5000)],
  });

  /** Lo que se está por borrar: la pregunta entera o una respuesta. */
  readonly confirmDelete = signal<'root' | number | null>(null);
  readonly deleting = signal(false);

  constructor() {
    this.api
      .get(this.id)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (thread) => {
          this.thread.set(thread);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos abrir la discusión.'));
          this.loading.set(false);
        },
      });
  }

  isStaff(author: DiscussionAuthor): boolean {
    return author.role !== 'STUDENT';
  }

  send(): void {
    const body = this.reply.value.trim();

    if (this.reply.invalid || !body) {
      this.reply.markAsTouched();
      return;
    }

    this.sending.set(true);
    this.error.set('');

    this.api.reply(this.id, body).subscribe({
      next: (created: Reply) => {
        this.thread.update((thread) =>
          thread
            ? {
                ...thread,
                replies: [...thread.replies, created],
                // Responde un docente o admin: la pregunta pasa a respondida.
                answered: thread.answered || this.isStaff(created.author),
              }
            : thread,
        );
        this.reply.reset('');
        this.sending.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos enviar la respuesta.'));
        this.sending.set(false);
      },
    });
  }

  askDelete(target: 'root' | number): void {
    this.confirmDelete.set(target);
  }

  cancelDelete(): void {
    this.confirmDelete.set(null);
  }

  remove(): void {
    const target = this.confirmDelete();

    if (target === null) {
      return;
    }

    const id = target === 'root' ? this.id : target;

    this.deleting.set(true);
    this.error.set('');

    this.api.remove(id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.confirmDelete.set(null);

        if (target === 'root') {
          void this.router.navigate(['/teacher/discussions']);
          return;
        }

        // Si se borra la única respuesta de un docente, la pregunta vuelve a "sin responder".
        this.thread.update((thread) => {
          if (!thread) {
            return thread;
          }

          const replies = thread.replies.filter((entry) => entry.id !== target);

          return {
            ...thread,
            replies,
            answered:
              thread.kind === 'QUESTION' && replies.some((entry) => this.isStaff(entry.author)),
          };
        });
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos eliminarlo.'));
        this.confirmDelete.set(null);
        this.deleting.set(false);
      },
    });
  }
}
