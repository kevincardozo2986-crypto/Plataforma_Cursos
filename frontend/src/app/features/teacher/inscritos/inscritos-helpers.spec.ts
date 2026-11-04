import { describe, expect, it } from 'vitest';

import { StudentRow } from '../../../core/dashboard/analytics.service';
import {
  averagePct,
  classify,
  colorOf,
  countByState,
  daysSince,
  initialsOf,
  IxRow,
  matchesQuery,
  riskOf,
  sortRows,
  toIxRow,
  whenLabel,
} from './inscritos-helpers';

const now = new Date('2026-11-04T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const row = (overrides: Partial<StudentRow> & { name?: string } = {}): StudentRow => ({
  enrollmentId: 1,
  student: { id: 1, firstName: 'Ana', lastName: 'Ruiz', email: 'ana@example.com' },
  course: { id: 1, title: 'Angular' },
  state: 'IN_PROGRESS',
  enrolledAt: daysAgo(30),
  completedAt: null,
  lastActivityAt: daysAgo(2),
  progress: { completed: 3, total: 10, percent: 30 },
  quizAverage: null,
  taskAverage: null,
  weeks: [0, 0, 0, 0, 0, 0, 1, 2],
  quizzes: null,
  tasks: null,
  ...overrides,
});

const ix = (id: number, name: string, overrides: Partial<StudentRow> = {}): IxRow =>
  toIxRow(
    row({ enrollmentId: id, student: { id, firstName: name, lastName: 'Prueba', email: `${name}@x.com` }, ...overrides }),
    now,
  );

describe('classify', () => {
  it('terminó, en progreso, inactivo y sin empezar', () => {
    expect(classify(row({ state: 'COMPLETED' }))).toBe('done');
    expect(classify(row())).toBe('prog');
    expect(classify(row({ state: 'INACTIVE' }))).toBe('idle');
    expect(classify(row({ state: 'INACTIVE', progress: { completed: 0, total: 5, percent: 0 }, lastActivityAt: null }))).toBe('new');
    expect(classify(row({ progress: { completed: 0, total: 5, percent: 0 }, lastActivityAt: null }))).toBe('new');
  });

  it('quien terminó es «terminó» aunque no tenga actividad registrada', () => {
    expect(classify(row({ state: 'COMPLETED', lastActivityAt: null, progress: { completed: 0, total: 0, percent: 0 } }))).toBe('done');
  });
});

describe('días y etiquetas', () => {
  it('cuenta días desde la última actividad (nunca negativo) y null si no hay', () => {
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince(daysAgo(0), now)).toBe(0);
    expect(daysSince(daysAgo(34), now)).toBe(34);
    expect(daysSince(new Date(now.getTime() + 5000).toISOString(), now)).toBe(0);
  });

  it('Hoy, Ayer, Hace N días y Sin actividad', () => {
    expect(whenLabel(0)).toBe('Hoy');
    expect(whenLabel(1)).toBe('Ayer');
    expect(whenLabel(5)).toBe('Hace 5 días');
    expect(whenLabel(null)).toBe('Sin actividad');
  });

  it('iniciales y color estable por correo', () => {
    expect(initialsOf('laura', 'gómez')).toBe('LG');
    expect(initialsOf('', '')).toBe('?');
    expect(colorOf('a@x.com')).toBe(colorOf('a@x.com'));
    expect(['blue', 'teal', 'sand', 'green']).toContain(colorOf('b@x.com'));
  });
});

describe('sortRows', () => {
  const rows = [ix(1, 'Carla', { lastActivityAt: daysAgo(10) }), ix(2, 'Ana', { lastActivityAt: daysAgo(1) }), ix(3, 'Beto', { lastActivityAt: null, progress: { completed: 0, total: 5, percent: 0 } })];

  it('por última actividad: lo más reciente primero y quien nunca avanzó al final', () => {
    expect(sortRows(rows, 'days', 'asc').map((r) => r.student.firstName)).toEqual(['Ana', 'Carla', 'Beto']);
    expect(sortRows(rows, 'days', 'desc').map((r) => r.student.firstName)).toEqual(['Beto', 'Carla', 'Ana']);
  });

  it('por nombre y por avance, sin tocar la lista original', () => {
    expect(sortRows(rows, 'name', 'asc').map((r) => r.student.firstName)).toEqual(['Ana', 'Beto', 'Carla']);
    expect(sortRows(rows, 'pct', 'desc')[0].pct).toBe(30);
    expect(rows.map((r) => r.student.firstName)).toEqual(['Carla', 'Ana', 'Beto']);
  });
});

describe('matchesQuery', () => {
  it('busca en el nombre y en el correo, sin importar mayúsculas', () => {
    const r = ix(1, 'Laura');

    expect(matchesQuery(r, '')).toBe(true);
    expect(matchesQuery(r, ' LAURA ')).toBe(true);
    expect(matchesQuery(r, 'laura@x')).toBe(true);
    expect(matchesQuery(r, 'zzz')).toBe(false);
  });
});

describe('panorama del grupo', () => {
  const rows = [
    ix(1, 'A', { state: 'COMPLETED', progress: { completed: 5, total: 5, percent: 100 } }),
    ix(2, 'B', { state: 'INACTIVE', lastActivityAt: daysAgo(34) }),
    ix(3, 'C', { state: 'INACTIVE', lastActivityAt: daysAgo(41) }),
    ix(4, 'D', { progress: { completed: 0, total: 5, percent: 0 }, lastActivityAt: null }),
    ix(5, 'E'),
  ];

  it('cuenta cada estado y promedia el avance', () => {
    expect(countByState(rows)).toEqual({ done: 1, prog: 1, idle: 2, new: 1 });
    expect(averagePct(rows)).toBe(Math.round((100 + 30 + 30 + 0 + 30) / 5));
    expect(averagePct([])).toBe(0);
  });

  it('«necesitan un empujón»: primero quien no empezó, luego el que más lleva sin avanzar; máximo 3 y sin los ya recordados', () => {
    expect(riskOf(rows, new Set()).map((r) => r.student.firstName)).toEqual(['D', 'C', 'B']);
    expect(riskOf(rows, new Set([4])).map((r) => r.student.firstName)).toEqual(['C', 'B']);
    expect(riskOf(rows, new Set(), 1)).toHaveLength(1);
    expect(riskOf([ix(9, 'Z')], new Set())).toEqual([]);
  });
});
