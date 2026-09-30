import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../../core/auth/auth.service';
import { LoginSubmission } from '../../../../core/auth/auth.models';
import { CampusBrand } from '../../components/campus-brand/campus-brand';
import { LoginForm } from '../../components/login-form/login-form';
import { LoginLinks } from '../../components/login-links/login-links';
import { AccessibilityMenu } from '../../../../shared/ui/accessibility-menu/accessibility-menu';
@Component({
  selector: 'app-login-page',
  imports: [CampusBrand, LoginForm, LoginLinks, AccessibilityMenu],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly contrast = signal(false);
  readonly largeText = signal(false);
  login(credentials: LoginSubmission) {
    if (this.loading()) return;
    this.error.set('');
    this.notice.set('');
    this.loading.set(true);
    this.auth
      .login(credentials)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        error: (error: HttpErrorResponse) =>
          this.error.set(
            error.status === 401
              ? 'No pudimos iniciar sesión. Revisa tus datos o el estado de tu cuenta.'
              : error.status === 400
                ? 'Revisa el correo o documento y tu contraseña.'
                : 'No pudimos conectar con el campus. Inténtalo de nuevo en unos momentos.',
          ),
      });
  }
  unavailable(feature: string) {
    this.notice.set(feature + ' aún no está disponible.');
  }
}
