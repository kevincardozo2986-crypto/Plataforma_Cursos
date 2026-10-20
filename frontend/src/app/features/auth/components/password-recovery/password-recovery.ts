import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { apiErrorMessage } from '../../../../core/http/api-error';
@Component({
  selector: 'app-password-recovery',
  imports: [FormsModule],
  templateUrl: './password-recovery.html',
  styleUrl: './password-recovery.scss',
})
export class PasswordRecovery {
  readonly closed = output<void>();
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly challenge = signal('');
  readonly done = signal(false);
  readonly retryAt = signal(0);
  identifier = '';
  code = '';
  password = '';
  confirmation = '';
  request(): void {
    if (this.busy()) return;
    if (Date.now() < this.retryAt()) {
      this.error.set('Espera un minuto antes de solicitar otro código.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.http
      .post<{ challenge: string; retryAfterSeconds: number }>('/api/auth/recovery/request-code', {
        identifier: this.identifier.trim(),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (result) => {
          this.challenge.set(result.challenge);
          this.retryAt.set(Date.now() + result.retryAfterSeconds * 1000);
          this.code = '';
        },
        error: (error) =>
          this.error.set(
            apiErrorMessage(error, 'No pudimos procesar la solicitud. Intenta más tarde.'),
          ),
      });
  }
  confirm(): void {
    if (this.busy()) return;
    this.error.set('');
    if (this.password !== this.confirmation) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    this.busy.set(true);
    this.http
      .post('/api/auth/recovery/confirm-code', {
        challenge: this.challenge(),
        code: this.code,
        newPassword: this.password,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: () => {
          this.done.set(true);
          this.password = this.confirmation = this.code = '';
          this.challenge.set('');
        },
        error: (error) =>
          this.error.set(apiErrorMessage(error, 'No pudimos cambiar la contraseña.')),
      });
  }
  restart(): void {
    this.challenge.set('');
    this.error.set('');
    this.code = this.password = this.confirmation = '';
  }
}
