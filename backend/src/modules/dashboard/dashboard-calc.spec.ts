import {
  bucketOf,
  fillSeries,
  mergeSeries,
  percent,
  sinceOf,
} from './dashboard-calc.js';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('sinceOf', () => {
  const now = new Date('2026-10-06T12:00:00.000Z');

  it('"todo el tiempo" no limita la fecha', () => {
    expect(sinceOf('all', now)).toBeUndefined();
  });

  it('resta los días del periodo', () => {
    expect(sinceOf('7d', now)?.toISOString()).toBe('2026-09-29T12:00:00.000Z');
    expect(sinceOf('30d', now)?.toISOString()).toBe('2026-09-06T12:00:00.000Z');
    expect(sinceOf('1y', now)?.toISOString()).toBe('2025-10-06T12:00:00.000Z');
  });
});

describe('bucketOf', () => {
  it('por día en periodos cortos y por mes en los largos', () => {
    expect(['7d', '30d', '90d'].map((p) => bucketOf(p as '7d'))).toEqual(['day', 'day', 'day']);
    expect(bucketOf('1y')).toBe('month');
    expect(bucketOf('all')).toBe('month');
  });
});

describe('percent', () => {
  it('redondea y no divide entre cero', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(5, 0)).toBe(0);
  });
});

describe('fillSeries', () => {
  const now = new Date('2026-10-06T15:30:00.000Z');

  it('rellena con ceros los días sin movimiento, incluido hoy', () => {
    const series = fillSeries(
      [{ bucket: utc('2026-10-04'), enrollments: 2, completions: 1 }],
      'day',
      now,
      new Date('2026-10-03T08:00:00.000Z'),
    );

    expect(series).toEqual([
      { date: '2026-10-03', enrollments: 0, completions: 0 },
      { date: '2026-10-04', enrollments: 2, completions: 1 },
      { date: '2026-10-05', enrollments: 0, completions: 0 },
      { date: '2026-10-06', enrollments: 0, completions: 0 },
    ]);
  });

  it('por mes agrupa en meses completos', () => {
    const series = fillSeries(
      [{ bucket: utc('2026-08-01'), enrollments: 5, completions: 0 }],
      'month',
      now,
      new Date('2026-08-15T00:00:00.000Z'),
    );

    expect(series.map((p) => p.date)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(series[0].enrollments).toBe(5);
  });

  it('en "todo el tiempo" arranca en el primer dato', () => {
    const series = fillSeries(
      [{ bucket: utc('2026-09-01'), enrollments: 1, completions: 0 }],
      'month',
      now,
    );

    expect(series.map((p) => p.date)).toEqual(['2026-09', '2026-10']);
  });

  it('sin datos y sin fecha inicial queda vacía', () => {
    expect(fillSeries([], 'month', now)).toEqual([]);
  });

  it('con fecha inicial y sin datos devuelve ceros, para graficar igual', () => {
    const series = fillSeries([], 'day', now, new Date('2026-10-05T00:00:00.000Z'));

    expect(series).toHaveLength(2);
    expect(series.every((p) => p.enrollments === 0 && p.completions === 0)).toBe(true);
  });
});

describe('mergeSeries', () => {
  it('une inscripciones y finalizaciones de la misma fecha', () => {
    const merged = mergeSeries(
      [{ bucket: utc('2026-10-04'), total: 3 }],
      [
        { bucket: utc('2026-10-04'), total: 1 },
        { bucket: utc('2026-10-05'), total: 2 },
      ],
      'day',
    );

    expect(merged).toEqual([
      { bucket: utc('2026-10-04'), enrollments: 3, completions: 1 },
      { bucket: utc('2026-10-05'), enrollments: 0, completions: 2 },
    ]);
  });
});
