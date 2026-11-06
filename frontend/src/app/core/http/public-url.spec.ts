import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { canonicalMediaHtml, publicUrl } from './public-url';
import { basePathInterceptor } from './base-path.interceptor';
import { PublicUrlPipe } from './public-url.pipe';

describe('URLs bajo una subruta', () => {
  it('adapta recursos propios sin duplicar el prefijo ni cambiar enlaces externos', () => {
    for (const path of ['/api/uploads/file.pdf', '/images/logo.png', '/fonts/font.woff']) {
      expect(publicUrl(path, '/cursos-virtuales/')).toBe('/cursos-virtuales' + path);
      expect(publicUrl(path, '/')).toBe(path);
      expect(publicUrl(publicUrl(path, '/cursos-virtuales/'), '/cursos-virtuales/')).toBe(
        '/cursos-virtuales' + path,
      );
    }
    for (const value of [
      'https://example.com/api/file',
      '//example.com/file',
      'blob:example',
      '#parte',
      '/login',
      null,
    ]) {
      expect(publicUrl(value, '/cursos-virtuales/')).toBe(value);
    }
  });

  it('aplica la misma base a peticiones HTTP y recursos mostrados', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([basePathInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    const doc = TestBed.inject(DOCUMENT);
    const base = doc.querySelector('base') ?? doc.head.appendChild(doc.createElement('base'));
    const previous = base.getAttribute('href');
    base.setAttribute('href', '/cursos-virtuales/');
    try {
      const pipe = TestBed.runInInjectionContext(() => new PublicUrlPipe());
      expect(canonicalMediaHtml('<img src="/cursos-virtuales/api/uploads/image.webp">')).toBe(
        '<img src="/api/uploads/image.webp">',
      );
      expect(pipe.transform('/api/uploads/file.pdf')).toBe(
        '/cursos-virtuales/api/uploads/file.pdf',
      );
      TestBed.inject(HttpClient).get('/api/courses?page=2').subscribe();
      const http = TestBed.inject(HttpTestingController);
      http.expectOne('/cursos-virtuales/api/courses?page=2').flush([]);
      http.verify();
    } finally {
      if (previous === null) base.removeAttribute('href');
      else base.setAttribute('href', previous);
    }
  });
});
