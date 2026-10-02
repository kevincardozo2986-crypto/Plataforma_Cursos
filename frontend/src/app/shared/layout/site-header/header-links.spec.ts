import { headerLinksFor } from './header-links';

describe('headerLinksFor', () => {
  const labels = (role: Parameters<typeof headerLinksFor>[0]) =>
    headerLinksFor(role).map((link) => link.label);

  it('muestra solo el menú público a un invitado', () => {
    expect(labels(null)).toEqual(['Inicio', 'Cursos']);
  });

  it('agrega un enlace distinto según el rol', () => {
    expect(labels('STUDENT')).toContain('Mis cursos');
    expect(labels('TEACHER')).toContain('Mis cursos creados');
    expect(labels('ADMIN')).toContain('Usuarios');
  });

  it('marca como próximamente las páginas que aún no existen', () => {
    const pending = headerLinksFor('STUDENT').filter((link) => link.soon);

    expect(pending.map((link) => link.label)).toEqual(['Mis cursos']);
  });
});
