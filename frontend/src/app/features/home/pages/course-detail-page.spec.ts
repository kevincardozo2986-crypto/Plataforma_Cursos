import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { CourseDetailPage } from './course-detail-page';

describe('Detalle e inscripción del estudiante', () => {
  let http: HttpTestingController;
  let page: CourseDetailPage;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: () => ({ role: 'STUDENT' }) } },
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '7' })) } },
      ],
    });
    page = TestBed.createComponent(CourseDetailPage).componentInstance;
    http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/courses/7')
      .flush({ id: 7, title: 'Curso', visibility: 'PASSWORD', modules: [] });
  });
  afterEach(() => http.verify());
  it('inscribe con contraseña y actualiza la vista tras confirmación del servidor', () => {
    http.expectOne('/api/courses/7/progress').flush({}, { status: 404, statusText: 'Not found' });
    page.password = 'clave';
    page.enroll();
    page.enroll();
    const request = http.expectOne('/api/courses/7/enroll');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ password: 'clave' });
    expect(page.progress()).toBeNull();
    request.flush({ status: 'ACTIVE' });
    expect(page.progress()?.status).toBe('ACTIVE');
    expect(page.enrollmentNotice()).toContain('Inscripción realizada');
    expect(page.password).toBe('');
  });
  it('no permite una segunda inscripción si ya está inscrito', () => {
    http.expectOne('/api/courses/7/progress').flush({ status: 'ACTIVE', percent: 25 });
    page.enroll();
    http.expectNone('/api/courses/7/enroll');
    expect(page.progress()?.percent).toBe(25);
  });
  it('conserva el mensaje de cupo y permite volver a intentar', () => {
    http.expectOne('/api/courses/7/progress').flush({}, { status: 404, statusText: 'Not found' });
    page.enroll();
    http
      .expectOne('/api/courses/7/enroll')
      .flush(
        { message: 'El curso no tiene cupos disponibles' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(page.enrollmentError()).toContain('no tiene cupos');
    expect(page.submitting()).toBe(false);
    expect(page.progress()).toBeNull();
  });
  it('no permite inscribir si falló la comprobación de sesión', () => {
    http.expectOne('/api/courses/7/progress').flush({}, { status: 500, statusText: 'Error' });
    page.enroll();
    http.expectNone('/api/courses/7/enroll');
    expect(page.enrollmentKnown()).toBe(false);
  });
});
