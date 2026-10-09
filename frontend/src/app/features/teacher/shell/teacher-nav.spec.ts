import { Route } from '@angular/router';

import { TEACHER_ROUTES } from '../teacher.routes';
import { pendingPages, TEACHER_NAV } from './teacher-nav';

/** Rutas hijas (relativas a /teacher) que existen de verdad. */
const childPaths = (): string[] =>
  (TEACHER_ROUTES[0].children ?? []).map((route: Route) => route.path ?? '');

describe('TEACHER_NAV', () => {
  it('trae las secciones pedidas y el perfil', () => {
    expect(TEACHER_NAV.map((item) => item.label)).toEqual([
      'Inicio',
      'Cursos',
      'Mi perfil',
      'Anuncios',
      'Intentos del cuestionario',
      'Discusiones',
      'Tareas',
      'Zoom',
      'Certificados',
      'Analíticas',
    ]);
  });

  it('Zoom lleva sus tres submenús', () => {
    const zoom = TEACHER_NAV.find((item) => item.label === 'Zoom');

    expect(zoom?.children?.map((child) => child.label)).toEqual([
      'Configurar API',
      'Ajustes',
      'Ayuda',
    ]);
  });

  it('ninguna ruta del menú se repite', () => {
    const paths = TEACHER_NAV.flatMap((item) => [
      item.path,
      ...(item.children?.map((c) => c.path) ?? []),
    ]);

    expect(new Set(paths).size).toBe(paths.length);
  });

  it('todo enlace del menú tiene una ruta real, así no hay enlaces muertos', () => {
    const existing = childPaths();
    const linked = TEACHER_NAV.flatMap((item) => [
      item.path,
      ...(item.children?.map((c) => c.path) ?? []),
    ]);

    for (const path of linked) {
      expect(existing, `falta la ruta /teacher/${path}`).toContain(path);
    }
  });

  it('las páginas pendientes se generan solo para lo que no está listo', () => {
    const pending = pendingPages().map((page) => page.path);

    expect(pending).not.toContain('dashboard');
    expect(pending).not.toContain('courses');
    expect(pending).not.toContain('certificates');
    expect(pending).not.toContain('profile');
    expect(pending).not.toContain('announcements');
    expect(pending).not.toContain('discussions');
    expect(pending).not.toContain('quiz-attempts');
    expect(pending).not.toContain('assignments');
    expect(pending).toEqual(
      expect.arrayContaining([
        'zoom/api',
        'analytics',
      ]),
    );
  });
});
