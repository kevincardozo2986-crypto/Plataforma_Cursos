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
    expect(labels('ADMIN')).toContain('Usuarios');
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

  it('marca como próximamente las páginas que aún no existen', () => {
    const pending = headerLinksFor('STUDENT').filter((link) => link.soon);

    expect(pending.map((link) => link.label)).toEqual(['Mis cursos']);
  });
});
