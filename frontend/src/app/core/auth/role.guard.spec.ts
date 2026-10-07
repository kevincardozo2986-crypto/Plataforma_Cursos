import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';

import { AuthUser } from './auth.models';
import { AuthService } from './auth.service';
import { roleGuard } from './role.guard';

describe('roleGuard', () => {
  const user = signal<AuthUser | null>(null);

  beforeEach(() => {
    user.set(null);

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { user } }],
    });
  });

  const run = (...roles: Parameters<typeof roleGuard>) =>
    TestBed.runInInjectionContext(() =>
      roleGuard(...roles)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

  const path = (result: unknown) => TestBed.inject(Router).serializeUrl(result as UrlTree);

  it('manda al login a quien no tiene sesión', () => {
    expect(path(run('TEACHER'))).toBe('/login');
  });

  it('deja pasar al rol permitido', () => {
    user.set({ firstName: 'Ana', email: 'a@x.com', role: 'TEACHER' });

    expect(run('TEACHER', 'ADMIN')).toBe(true);
  });

  it('manda al inicio a un rol no permitido', () => {
    user.set({ firstName: 'Ana', email: 'a@x.com', role: 'STUDENT' });

    expect(path(run('TEACHER', 'ADMIN'))).toBe('/');
  });

  it('rechaza a un usuario sin rol', () => {
    user.set({ firstName: 'Ana', email: 'a@x.com' });

    expect(path(run('ADMIN'))).toBe('/');
  });
});
