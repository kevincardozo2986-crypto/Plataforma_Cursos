import {
  bucketOf,
  fillSeries,
  mergeSeries,
  percent,
  previousWindow,
  sinceOf,
  weeklyCounts,
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
  it('por día en 7 días, por semana en 30 y 90 días y por mes en lo largo', () => {
    expect(bucketOf('7d')).toBe('day');
    expect(['30d', '90d'].map((p) => bucketOf(p as '30d'))).toEqual(['week', 'week']);
    expect(bucketOf('1y')).toBe('month');
    expect(bucketOf('all')).toBe('month');
  });
});

describe('previousWindow', () => {
  const now = new Date('2026-10-06T12:00:00.000Z');

  it('es el tramo inmediatamente anterior, de la misma duración', () => {
    const window = previousWindow('30d', now)!;

    expect(window.to.toISOString()).toBe('2026-09-06T12:00:00.000Z');
    expect(window.from.toISOString()).toBe('2026-08-07T12:00:00.000Z');
  });

  it('"todo el tiempo" no tiene periodo anterior', () => {
    expect(previousWindow('all', now)).toBeUndefined();
  });
});

describe('fillSeries por semana', () => {
  it('arranca en el lunes de la semana de `since` y rellena las semanas vacías', () => {
    // 2026-10-06 es martes; su semana empieza el lunes 5.
    const series = fillSeries(
      [{ bucket: utc('2026-10-12'), enrollments: 3, completions: 1 }],
      'week',
      new Date('2026-10-20T10:00:00.000Z'),
      new Date('2026-10-06T10:00:00.000Z'),
    );

    expect(series).toEqual([
      { date: '2026-10-05', enrollments: 0, completions: 0 },
      { date: '2026-10-12', enrollments: 3, completions: 1 },
      { date: '2026-10-19', enrollments: 0, completions: 0 },
    ]);
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

describe('weeklyCounts', () => {
  const now = new Date('2026-11-04T12:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  it('cuenta por semana, de la más antigua a la actual (la última cubre los últimos 7 días)', () => {
    expect(weeklyCounts([daysAgo(0), daysAgo(3), daysAgo(6.9)], now)).toEqual([0, 0, 0, 0, 0, 0, 0, 3]);
    expect(weeklyCounts([daysAgo(7), daysAgo(13)], now)).toEqual([0, 0, 0, 0, 0, 0, 2, 0]);
    expect(weeklyCounts([daysAgo(55)], now)).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('lo que es más viejo que 8 semanas no se cuenta y lo futuro cae en la semana actual', () => {
    expect(weeklyCounts([daysAgo(57), daysAgo(200)], now)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(weeklyCounts([new Date(now.getTime() + 60_000)], now)[7]).toBe(1);
  });

  it('sin fechas son 8 ceros', () => {
    expect(weeklyCounts([], now)).toEqual(new Array(8).fill(0));
  });
});
