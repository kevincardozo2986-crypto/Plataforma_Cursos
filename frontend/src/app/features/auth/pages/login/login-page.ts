import {
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';

import {
  HttpErrorResponse,
} from '@angular/common/http';

import {
  Router,
} from '@angular/router';

import {
  finalize,
} from 'rxjs';

import {
  takeUntilDestroyed,
} from '@angular/core/rxjs-interop';

import {
  TranslatePipe,
} from '../../../../core/i18n/translate.pipe';

import {
  AuthService,
} from '../../../../core/auth/auth.service';

import {
  LoginSubmission,
} from '../../../../core/auth/auth.models';

import {
  homeFor,
} from '../../../../core/auth/role-home';

import {
  LoginForm,
} from '../../components/login-form/login-form';

import {
  LoginLinks,
} from '../../components/login-links/login-links';

import {
  LoginHeader,
} from '../../components/login-header/login-header';

@Component({
  selector: 'app-login-page',

  imports: [
    TranslatePipe,
    LoginHeader,
    LoginForm,
    LoginLinks,
  ],

  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  readonly auth = inject(AuthService);

  private readonly router =
    inject(Router);

  private readonly destroyRef =
    inject(DestroyRef);

  readonly loading =
    signal(false);

  readonly error =
    signal('');

  readonly notice =
    signal('');

  /* =====================================
     LOGIN
     ===================================== */

  login(
    credentials: LoginSubmission,
  ): void {
    if (this.loading()) {
      return;
    }

    this.error.set('');
    this.notice.set('');
    this.loading.set(true);

    this.auth
      .login(credentials)
      .pipe(
        takeUntilDestroyed(
          this.destroyRef,
        ),

        finalize(() =>
          this.loading.set(false),
        ),
      )
      .subscribe({
        /* =============================
           LOGIN CORRECTO
           ============================= */

        next: () => {
          this.router.navigate(homeFor(this.auth.user()?.role));
        },

        /* =============================
           ERROR
           ============================= */

        error: (
          error: HttpErrorResponse,
        ) => {
          this.error.set(
            error.status === 401
              ? 'No pudimos iniciar sesión. Revisa tus datos o el estado de tu cuenta.'
              : error.status === 400
                ? 'Revisa el correo o documento y tu contraseña.'
                : 'No pudimos conectar con el campus. Inténtalo de nuevo en unos momentos.',
          );
        },
      });
  }

  /* =====================================
     FUNCIONES NO DISPONIBLES
     ===================================== */

  unavailable(
    feature: string,
  ): void {
    this.notice.set(
      feature +
      ' aún no está disponible.',
    );
  }
}