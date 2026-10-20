import { RouterLink } from '@angular/router';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, switchMap } from 'rxjs';
import { ProfileService, ProfileData } from '../../../core/profile/profile.service';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/api-error';

@Component({
  selector: 'app-account-settings',
  imports: [FormsModule, RouterLink],
  templateUrl: './account-settings.html',
  styleUrl: './account-settings.scss',
})
export class AccountSettings {
  readonly auth = inject(AuthService);
  private readonly profiles = inject(ProfileService);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly passwordSaving = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly passwordMessage = signal('');
  readonly passwordError = signal('');
  firstName = '';
  lastName = '';
  email = '';
  phone = '';
  emailPassword = '';
  readonly codeSent = signal(false);
  readonly passwordChanged = signal(false);
  readonly requestingCode = signal(false);
  readonly destination = signal('');
  readonly retryAt = signal(0);
  identifier = '';
  code = '';
  newPassword = '';
  confirmPassword = '';
  originalEmail = '';
  constructor() {
    this.load();
  }
  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.profiles
      .get()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (data) => {
          this.firstName = data.account.firstName;
          this.lastName = data.account.lastName;
          this.email = this.originalEmail = data.account.email;
          this.phone = data.account.phone ?? '';
          this.sync(data);
        },
        error: (error) => this.error.set(apiErrorMessage(error, 'No pudimos cargar tu cuenta.')),
      });
  }
  private sync(data: ProfileData): void {
    this.auth.user.update((user) =>
      user ? { ...user, ...data.account, avatarUrl: data.profile.avatarUrl } : user,
    );
  }
  save(): void {
    if (this.saving() || this.uploading()) return;
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    this.profiles
      .update({
        firstName: this.firstName.trim(),
        lastName: this.lastName.trim(),
        email: this.email.trim().toLowerCase(),
        phone: this.phone.trim() || null,
        ...(this.email.trim().toLowerCase() !== this.originalEmail
          ? { currentPassword: this.emailPassword }
          : {}),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (data) => {
          this.sync(data);
          this.originalEmail = this.email = data.account.email;
          this.emailPassword = '';
          this.message.set('Tus datos se guardaron correctamente.');
        },
        error: (error) => this.error.set(apiErrorMessage(error, 'No pudimos guardar los cambios.')),
      });
  }
  upload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    this.error.set('');
    this.message.set('');
    if (
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      this.error.set('Usa una foto JPG, PNG, WebP o GIF de hasta 5 MB.');
      return;
    }
    this.uploading.set(true);
    const body = new FormData();
    body.append('file', file);
    this.http
      .post<{ url: string }>('/api/uploads/avatars', body)
      .pipe(
        switchMap((result) => this.profiles.update({ avatarUrl: result.url })),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploading.set(false)),
      )
      .subscribe({
        next: (data) => {
          this.sync(data);
          this.message.set('Tu foto se actualizó.');
        },
        error: (error) => this.error.set(apiErrorMessage(error, 'No pudimos subir la foto.')),
      });
  }
  removePhoto(): void {
    this.uploading.set(true);
    this.error.set('');
    this.message.set('');
    this.profiles
      .update({ avatarUrl: null })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploading.set(false)),
      )
      .subscribe({
        next: (data) => {
          this.sync(data);
          this.message.set('Foto eliminada.');
        },
        error: (error) => this.error.set(apiErrorMessage(error, 'No pudimos quitar la foto.')),
      });
  }
  requestCode(): void {
    if (this.requestingCode() || Date.now() < this.retryAt()) {
      this.passwordError.set('Espera un minuto antes de pedir otro codigo.');
      return;
    }
    this.passwordError.set('');
    this.requestingCode.set(true);
    this.http
      .post<{ destination: string; retryAfterSeconds: number }>('/api/auth/password/request-code', {
        identifier: this.identifier.trim(),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.requestingCode.set(false)),
      )
      .subscribe({
        next: (result) => {
          this.codeSent.set(true);
          this.destination.set(result.destination);
          this.retryAt.set(Date.now() + result.retryAfterSeconds * 1000);
          this.code = '';
        },
        error: (error) =>
          this.passwordError.set(apiErrorMessage(error, 'No pudimos enviar el codigo.')),
      });
  }
  changePassword(): void {
    if (this.passwordSaving()) return;
    this.passwordError.set('');
    this.passwordMessage.set('');
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError.set('Las contraseñas nuevas no coinciden.');
      return;
    }
    this.passwordSaving.set(true);
    this.http
      .post('/api/auth/password/confirm-code', {
        code: this.code.trim(),
        newPassword: this.newPassword,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.passwordSaving.set(false)),
      )
      .subscribe({
        next: () => {
          this.newPassword = this.confirmPassword = this.code = '';
          this.passwordChanged.set(true);
          this.auth.logout();
        },
        error: (error) =>
          this.passwordError.set(apiErrorMessage(error, 'No pudimos cambiar la contraseña.')),
      });
  }
}
