import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { StudentDashboard, StudentEnrollment } from './student-dashboard';

describe('Inicio del estudiante', () => {
  let page: StudentDashboard;
  let http: HttpTestingController;
  const items: StudentEnrollment[] = [
    {
      id: 1,
      courseId: 1,
      status: 'ACTIVE',
      course: { id: 1, title: 'Diseño digital', imageUrl: null, level: 'BEGINNER' },
      progress: { percent: 50, completedLessons: 2, totalLessons: 4 },
    },
    {
      id: 2,
      courseId: 2,
      status: 'COMPLETED',
      course: { id: 2, title: 'Python', imageUrl: null, level: 'BEGINNER' },
      progress: { percent: 100, completedLessons: 6, totalLessons: 6 },
    },
    {
      id: 3,
      courseId: 3,
      status: 'ACTIVE',
      course: { id: 3, title: 'Marketing', imageUrl: null, level: 'BEGINNER' },
      progress: { percent: 0, completedLessons: 0, totalLessons: 10 },
    },
  ];
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { user: () => ({ firstName: 'Kevin', lastName: 'Prueba' }) },
        },
      ],
    });
    page = TestBed.createComponent(StudentDashboard).componentInstance;
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    for (const request of http.match('/api/enrollments/streak')) {
      request.flush({ days: 0, studiedToday: false, week: [] });
    }
    http.verify();
  });
  it('calcula el progreso por lecciones y distingue cursos sin empezar', () => {
    http.expectOne('/api/enrollments/mine').flush(items);
    expect(page.overallProgress()).toBe(40);
    expect(page.completedLessons()).toBe(8);
    expect(page.inProgress().length).toBe(1);
    expect(page.pending().length).toBe(1);
    expect(page.completed().length).toBe(1);
    expect(page.featured()?.courseId).toBe(1);
  });
  it('combina búsqueda sin tildes y filtro de estado', () => {
    http.expectOne('/api/enrollments/mine').flush(items);
    page.query.set('diseno');
    expect(page.visible().map((item) => item.id)).toEqual([1]);
    page.filter.set('COMPLETED');
    expect(page.visible()).toEqual([]);
    page.showAll();
    expect(page.visible().length).toBe(3);
  });
  it('soporta una cuenta sin inscripciones sin inventar avance', () => {
    http.expectOne('/api/enrollments/mine').flush([]);
    expect(page.overallProgress()).toBe(0);
    expect(page.featured()).toBeUndefined();
    expect(page.loading()).toBe(false);
  });
  it('permite recuperar la carga después de un error', () => {
    http.expectOne('/api/enrollments/mine').flush({}, { status: 500, statusText: 'Error' });
    expect(page.error()).toBeTruthy();
    page.load();
    expect(page.error()).toBe('');
    http.expectOne('/api/enrollments/mine').flush(items);
    expect(page.loading()).toBe(false);
    expect(page.enrollments().length).toBe(3);
  });
  it('consulta avisos reales y evita duplicar una solicitud pendiente', () => {
    http.expectOne('/api/enrollments/mine').flush(items);
    page.openNotifications();
    page.openNotifications();
    page.openNotifications();
    http
      .expectOne('/api/notifications?limit=8')
      .flush({ items: [{ id: 1, title: 'Nueva lección' }], unread: 1 });
    expect(page.unread()).toBe(1);
    expect(page.notifications()[0].title).toBe('Nueva lección');
    page.closeMenus();
    expect(page.panel()).toBeNull();
  });
});
