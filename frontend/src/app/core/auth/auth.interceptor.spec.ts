import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { basePathInterceptor } from '../http/base-path.interceptor';

describe('Protección del token de sesión', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([basePathInterceptor, authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    sessionStorage.setItem('campus.accessToken', 'session-token');
  });
  afterEach(() => {
    sessionStorage.removeItem('campus.accessToken');
    TestBed.inject(HttpTestingController).verify();
  });

  it('envía el token a la API propia', () => {
    TestBed.inject(HttpClient).get('/api/auth/me').subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne('/api/auth/me');
    expect(request.request.headers.get('Authorization')).toBe('Bearer session-token');
    request.flush({});
  });

  it('no expone el token en sitios externos ni en recursos públicos', () => {
    for (const url of [
      'https://example.com/api/file',
      '//example.com/api/file',
      '/images/logo.png',
    ]) {
      TestBed.inject(HttpClient).get(url).subscribe();
      const request = TestBed.inject(HttpTestingController).expectOne(url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
    }
  });
});
