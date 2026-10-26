import { headerLinksFor } from './header-links';

describe('headerLinksFor', () => {
  const labels = (role: Parameters<typeof headerLinksFor>[0]) =>
    headerLinksFor(role).map((link) => link.label);

  it('muestra solo el menú público a un invitado', () => {
    expect(labels(null)).toEqual(['Inicio', 'Cursos']);
  });

  it('agrega enlaces distintos según el rol', () => {
    expect(labels('STUDENT')).toContain('Mis cursos');
    expect(labels('TEACHER')).toEqual(expect.arrayContaining(['Panel', 'Mis cursos']));
    expect(labels('ADMIN')).toEqual(expect.arrayContaining(['Administración', 'Panel docente']));
  });

  it('el profesor enlaza a su panel y a sus cursos, ya disponibles', () => {
    const teacherLinks = headerLinksFor('TEACHER').filter((link) =>
      link.route?.startsWith('/teacher'),
    );

    expect(teacherLinks.map((link) => link.route)).toEqual([
      '/teacher/dashboard',
      '/teacher/courses',
    ]);
    expect(teacherLinks.every((link) => !link.soon && link.prefix)).toBe(true);
  });

  it('el administrador enlaza a su administración y al panel docente, ya disponibles', () => {
    const links = headerLinksFor('ADMIN');

    expect(links.filter((link) => link.soon)).toEqual([]);
    expect(links.find((link) => link.label === 'Administración')?.route).toBe('/admin');
  });

  it('lleva al estudiante a su panel y a sus inscripciones', () => {
    const links = headerLinksFor('STUDENT');
    expect(links.find((link) => link.label === 'Inicio')?.route).toBe('/student/dashboard');
    expect(links.find((link) => link.label === 'Mis cursos')).toMatchObject({
      route: '/student/dashboard',
      fragment: 'my-courses',
    });
    expect(links.every((link) => !link.soon)).toBe(true);
  });
});
