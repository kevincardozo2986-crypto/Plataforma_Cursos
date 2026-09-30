import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { LoginResponse, LoginSubmission } from './auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly user = signal<LoginResponse['user'] | null>(null);
  readonly storageNotice = signal('');
  login({ identifier, password, remember }: LoginSubmission) {
    return this.http
      .post<LoginResponse>('/api/auth/login', { identifier: identifier.trim(), password })
      .pipe(
        tap((response) => {
          this.storageNotice.set('');
          try {
            localStorage.removeItem('campus.accessToken');
            sessionStorage.removeItem('campus.accessToken');
            (remember ? localStorage : sessionStorage).setItem(
              'campus.accessToken',
              response.accessToken,
            );
          } catch {
            this.storageNotice.set('Tu navegador no permite guardar la sesión.');
          }
          this.user.set(response.user);
        }),
      );
  }
  logout() {
    try {
      localStorage.removeItem('campus.accessToken');
      sessionStorage.removeItem('campus.accessToken');
    } catch {
      this.storageNotice.set('No pudimos acceder al almacenamiento del navegador.');
    }
    this.user.set(null);
  }
}
