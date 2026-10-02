import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { UserRole } from './auth.models';
import { AuthService } from './auth.service';

/**
 * Deja pasar solo a usuarios con alguno de los roles indicados.
 * Sin sesión → /login. Con otro rol → inicio.
 * La sesión ya está restaurada cuando corre (ver provideAppInitializer).
 */
export const roleGuard =
  (...roles: UserRole[]): CanActivateFn =>
  () => {
    const user = inject(AuthService).user();
    const router = inject(Router);

    if (!user) {
      return router.createUrlTree(['/login']);
    }

    return user.role && roles.includes(user.role) ? true : router.createUrlTree(['/']);
  };
