import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { homeFor } from './role-home';

export const publicHomeGuard: CanActivateFn = () => {
  const user = inject(AuthService).user();
  return user?.role === 'TEACHER' || user?.role === 'ADMIN'
    ? inject(Router).createUrlTree(homeFor(user.role))
    : true;
};
