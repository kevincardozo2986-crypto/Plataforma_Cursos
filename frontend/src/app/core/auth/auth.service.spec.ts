import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
describe('AuthService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  for (const remember of [false, true]) {
    it('envía identifier y guarda la sesión según recordarme=' + remember, () => {
      const auth = TestBed.inject(AuthService);
      auth.login({ identifier: ' 0012345 ', password: 'password123', remember }).subscribe();
      const req = TestBed.inject(HttpTestingController).expectOne('/api/auth/login');
      expect(req.request.body).toEqual({ identifier: '0012345', password: 'password123' });
      req.flush({ accessToken: 'token', user: { firstName: 'Kevin', email: 'test@example.com' } });
      expect((remember ? localStorage : sessionStorage).getItem('campus.accessToken')).toBe(
        'token',
      );
      expect((remember ? sessionStorage : localStorage).getItem('campus.accessToken')).toBeNull();
      expect(auth.user()?.firstName).toBe('Kevin');
      auth.logout();
      expect(auth.user()).toBeNull();
      expect(localStorage.getItem('campus.accessToken')).toBeNull();
      expect(sessionStorage.getItem('campus.accessToken')).toBeNull();
    });
  }
});
