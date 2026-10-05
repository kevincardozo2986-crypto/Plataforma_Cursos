import { SLUG_PATTERN, slugify } from './slugify';

describe('slugify', () => {
  it('quita tildes, pasa a minúsculas y une con guiones', () => {
    expect(slugify('Introducción a la Programación')).toBe('introduccion-a-la-programacion');
  });

  it('colapsa símbolos y espacios repetidos y recorta los bordes', () => {
    expect(slugify('  ¡Hola,   mundo!!  ')).toBe('hola-mundo');
  });

  it('devuelve vacío si no hay letras ni números', () => {
    expect(slugify('¿¿??')).toBe('');
  });

  it('lo que genera siempre cumple el patrón del backend', () => {
    for (const title of ['Node.js 22', 'Ñandú & Co', 'C++ avanzado']) {
      expect(slugify(title)).toMatch(SLUG_PATTERN);
    }
  });
});

describe('SLUG_PATTERN', () => {
  it.each(['curso', 'curso-1', 'a1-b2-c3'])('acepta %s', (slug) => {
    expect(SLUG_PATTERN.test(slug)).toBe(true);
  });

  it.each(['Curso', 'curso 1', '-curso', 'curso-', 'curso--uno', 'curso_uno'])('rechaza %s', (slug) => {
    expect(SLUG_PATTERN.test(slug)).toBe(false);
  });
});
