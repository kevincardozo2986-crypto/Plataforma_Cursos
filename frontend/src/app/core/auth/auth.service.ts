import { inject, Injectable, signal } from '@angular/core';

import { HttpClient } from '@angular/common/http';

import { catchError, of, tap } from 'rxjs';

import { LoginResponse, LoginSubmission, RegisterRequest, RegisterResponse } from './auth.models';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);

  /* =====================================
     ESTADO DEL USUARIO
     ===================================== */

  readonly user = signal<LoginResponse['user'] | null>(null);

  readonly storageNotice = signal('');

  /* =====================================
     LOGIN
     ===================================== */

  login({ identifier, password, remember }: LoginSubmission) {
    return this.http
      .post<LoginResponse>('/api/auth/login', {
        identifier: identifier.trim(),

        password,
      })
      .pipe(
        tap((response) => {
          this.storageNotice.set('');

          try {
            /*
             * Eliminamos cualquier sesión
             * anterior antes de guardar
             * la nueva.
             */

            localStorage.removeItem('campus.accessToken');

            sessionStorage.removeItem('campus.accessToken');

            /*
             * Si marcó "Recordarme":
             * localStorage.
             *
             * Si no:
             * sessionStorage.
             */

            (remember ? localStorage : sessionStorage).setItem(
              'campus.accessToken',
              response.accessToken,
            );
          } catch {
            this.storageNotice.set('Tu navegador no permite guardar la sesión.');
          }

          /*
           * Guardamos el usuario
           * en memoria.
           */

          this.user.set(response.user);
        }),
      );
  }

  /* =====================================
     REGISTER
     ===================================== */

  register(data: RegisterRequest) {
    return this.http.post<RegisterResponse>('/api/auth/register', {
      firstName: data.firstName.trim(),

      lastName: data.lastName.trim(),

      document: data.document.trim(),

      email: data.email.trim().toLowerCase(),

      password: data.password,
    });
  }

  /* =====================================
     RESTAURAR SESIÓN
     ===================================== */

  restoreSession() {
    /*
     * Primero verificamos si existe
     * un token guardado.
     */

    let token: string | null = null;

    try {
      token =
        localStorage.getItem('campus.accessToken') ?? sessionStorage.getItem('campus.accessToken');
    } catch {
      this.storageNotice.set('No pudimos acceder al almacenamiento del navegador.');

      return of(null);
    }

    /*
     * Si no hay token, el usuario
     * simplemente está como invitado.
     */

    if (!token) {
      this.user.set(null);

      return of(null);
    }

    /*
     * Si existe token, preguntamos
     * al backend quién es el usuario.
     *
     * El authInterceptor agregará:
     *
     * Authorization: Bearer <token>
     */

    return this.http.get<LoginResponse['user']>('/api/auth/me').pipe(
      tap((user) => {
        this.user.set(user);
      }),

      catchError(() => {
        /*
         * Si el token expiró,
         * es inválido o el backend
         * devuelve 401, limpiamos
         * la sesión.
         */

        this.clearSession();

        return of(null);
      }),
    );
  }

  /* =====================================
     LOGOUT
     ===================================== */

  logout() {
    this.clearSession();
  }

  /* =====================================
     LIMPIAR SESIÓN
     ===================================== */

  private clearSession(): void {
    try {
      localStorage.removeItem('campus.accessToken');

      sessionStorage.removeItem('campus.accessToken');
    } catch {
      this.storageNotice.set('No pudimos acceder al almacenamiento del navegador.');
    }

    this.user.set(null);
  }
}
