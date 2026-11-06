import { describe, expect, it } from 'vitest';

import { TeacherCourse } from '../teacher-courses.models';
import {
  coverColorOf,
  matchesQuery,
  monogram,
  priceLabel,
  relativeDate,
  relativeLower,
  setupDone,
  setupSteps,
  sortCourses,
} from './course-list-helpers';

const NONE = { enrolled: 0, avgProgress: 0, lessons: 0, certificate: 'PLATFORM' as const };

function course(over: Partial<TeacherCourse> = {}): TeacherCourse {
  return {
    id: 1,
    title: 'Curso sin título',
    price: '0',
    categoryId: null,
    category: null,
    imageUrl: null,
    updatedAt: '2026-11-04T10:00:00.000Z',
    library: NONE,
    ...over,
  } as TeacherCourse;
}

const NOW = new Date(2026, 10, 4, 12, 0, 0);

describe('coverColorOf', () => {
  it('da siempre el mismo color a un curso', () => {
    expect(coverColorOf(5)).toBe(coverColorOf(5));
    expect(['blue', 'teal', 'sand', 'green']).toContain(coverColorOf(123));
  });
});

describe('monogram', () => {
  it('usa las iniciales de las dos primeras palabras', () => {
    expect(monogram('Bases de datos I')).toBe('BD');
    expect(monogram('Curso del asistente 5024')).toBe('CD');
  });

  it('con una sola palabra toma sus dos primeras letras', () => {
    expect(monogram('cursoPok')).toBe('CU');
  });

  it('sin título es "Aa"', () => {
    expect(monogram('Curso sin título')).toBe('Aa');
    expect(monogram('   ')).toBe('Aa');
  });
});

describe('setupSteps', () => {
  it('marca solo lo que el curso ya tiene', () => {
    const c = course({ title: 'Bases de datos I', categoryId: 3 });

    expect(setupSteps(c).map((s) => s.ok)).toEqual([true, true, false, false, false]);
    expect(setupDone(c)).toBe(2);
  });

  it('un curso completo cuenta 5 de 5', () => {
    const c = course({
      title: 'Completo',
      categoryId: 1,
      imageUrl: '/a.png',
      price: '49000',
      library: { ...NONE, lessons: 4 },
    });

    expect(setupDone(c)).toBe(5);
  });

  it('un borrador recién creado cuenta 0 de 5', () => {
    expect(setupDone(course())).toBe(0);
  });
});

describe('relativeDate', () => {
  it('habla en días de calendario', () => {
    expect(relativeDate(new Date(2026, 10, 4, 1).toISOString(), NOW)).toBe('Editado hoy');
    expect(relativeDate(new Date(2026, 10, 3, 23).toISOString(), NOW)).toBe('Ayer');
    expect(relativeDate(new Date(2026, 10, 1, 9).toISOString(), NOW)).toBe('Hace 3 días');
  });

  it('desde una semana muestra la fecha corta', () => {
    expect(relativeDate(new Date(2026, 9, 26, 9).toISOString(), NOW)).toBe('26 de oct');
    expect(relativeDate(new Date(2025, 11, 2, 9).toISOString(), NOW)).toBe('2 de dic 2025');
  });

  it('relativeLower pone la primera letra en minúscula', () => {
    expect(relativeLower(new Date(2026, 10, 4, 1).toISOString(), NOW)).toBe('editado hoy');
  });
});

describe('priceLabel', () => {
  it('Gratis o con separador de miles', () => {
    expect(priceLabel('0')).toBe('Gratis');
    expect(priceLabel('49000.00')).toMatch(/^\$ 49[.,\s]?000$/);
  });
});

describe('matchesQuery', () => {
  it('busca en título y categoría sin importar mayúsculas', () => {
    const c = course({ title: 'Prerrequisito 5024', category: { id: 1, name: 'Ingeniería' } });

    expect(matchesQuery(c, 'prerreq')).toBe(true);
    expect(matchesQuery(c, 'INGENI')).toBe(true);
    expect(matchesQuery(c, 'xyz')).toBe(false);
    expect(matchesQuery(c, '  ')).toBe(true);
  });
});

describe('sortCourses', () => {
  const a = course({ id: 1, title: 'Zeta', updatedAt: '2026-11-01T00:00:00Z', library: { ...NONE, enrolled: 5 } });
  const b = course({ id: 2, title: 'Alfa', updatedAt: '2026-11-03T00:00:00Z', library: { ...NONE, enrolled: 50 } });
  const c = course({ id: 3, title: 'Curso sin título', updatedAt: '2026-11-02T00:00:00Z' });

  it('recientes: la edición más nueva primero', () => {
    expect(sortCourses([a, b, c], 'rec').map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it('A–Z: los sin título van al final', () => {
    expect(sortCourses([a, b, c], 'az').map((x) => x.id)).toEqual([2, 1, 3]);
  });

  it('más estudiantes primero', () => {
    expect(sortCourses([a, b, c], 'stu').map((x) => x.id)).toEqual([2, 1, 3]);
  });

  it('no modifica la lista original', () => {
    const list = [a, b, c];

    sortCourses(list, 'az');

    expect(list.map((x) => x.id)).toEqual([1, 2, 3]);
  });
});
