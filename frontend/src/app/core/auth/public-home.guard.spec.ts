import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { publicHomeGuard } from './public-home.guard';
import { homeFor } from './role-home';

describe('Destino de inicio por sesión', () => {
  for (const [role, path] of [
    ['STUDENT', '/student/dashboard'],
    ['TEACHER', '/teacher/dashboard'],
    ['ADMIN', '/teacher/dashboard'],
  ] as const) {
    it(`redirige ${role} fuera del inicio informativo`, () => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([]),
          { provide: AuthService, useValue: { user: () => ({ role }) } },
        ],
      });
      const result = TestBed.runInInjectionContext(() => publicHomeGuard({} as never, {} as never));
      expect(
        TestBed.inject(Router).serializeUrl(result as ReturnType<Router['createUrlTree']>),
      ).toBe(path);
      expect(homeFor(role)).toEqual([path]);
    });
  }

  it('mantiene el inicio informativo para visitantes', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user: () => null } }],
    });
    expect(TestBed.runInInjectionContext(() => publicHomeGuard({} as never, {} as never))).toBe(
      true,
    );
    expect(homeFor()).toEqual(['/']);
  });
});
