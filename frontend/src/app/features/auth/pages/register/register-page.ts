import {
  Component,
  inject,
  signal,
} from '@angular/core';

import {
  Router,
  RouterLink,
} from '@angular/router';

import {
  HttpErrorResponse,
} from '@angular/common/http';

import {
  finalize,
} from 'rxjs';

import {
  RegisterForm,
  RegisterSubmission,
} from '../../components/register-form/register-form';

import {
  CampusBrand,
} from '../../components/campus-brand/campus-brand';

import {
  TranslatePipe,
} from '../../../../core/i18n/translate.pipe';

import {
  AuthService,
} from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-register-page',

  imports: [
    RegisterForm,
    CampusBrand,
    RouterLink,
    TranslatePipe,
  ],

  templateUrl:
    './register-page.html',

  styleUrl:
    './register-page.scss',
})
export class RegisterPage {
  private readonly auth =
    inject(AuthService);

  private readonly router =
    inject(Router);

  readonly loading =
    signal(false);

  readonly error =
    signal('');

  register(
    data: RegisterSubmission,
  ): void {
    if (this.loading()) {
      return;
    }

    this.error.set('');
    this.loading.set(true);

    this.auth
      .register(data)
      .pipe(
        finalize(() => {
          this.loading.set(false);
        }),
      )
      .subscribe({
        next: () => {
          this.router.navigate(
            ['/login'],
            {
              queryParams: {
                registered: 'true',
              },
            },
          );
        },

        error: (
          err: HttpErrorResponse,
        ) => {
          const message =
            err.error?.message;

          if (Array.isArray(message)) {
            this.error.set(
              message.join(' '),
            );

            return;
          }

          if (
            typeof message ===
            'string'
          ) {
            this.error.set(message);

            return;
          }

          this.error.set(
            'No se pudo crear la cuenta. Inténtalo nuevamente.',
          );
        },
      });
  }
}