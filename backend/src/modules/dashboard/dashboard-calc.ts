export const PERIODS = ['7d', '30d', '90d', '1y', 'all'] as const;
export type Period = (typeof PERIODS)[number];

export type Bucket = 'day' | 'week' | 'month';

/** Días sin avanzar en un curso para considerar inactiva una inscripción. */
export const INACTIVE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

/** Desde cuándo cuenta el periodo; `undefined` en "todo el tiempo". */
export function sinceOf(period: Period, now: Date): Date | undefined {
  return period === 'all'
    ? undefined
    : new Date(now.getTime() - PERIOD_DAYS[period] * DAY_MS);
}

/** 7 días se grafican por día; 30 y 90 días, por semana; un año y "todo", por mes. */
export function bucketOf(period: Period): Bucket {
  if (period === '7d') return 'day';
  if (period === '30d' || period === '90d') return 'week';

  return 'month';
}

/**
 * El periodo inmediatamente anterior, de la misma duración (para decir "subió o bajó").
 * "Todo el tiempo" no tiene anterior.
 */
export function previousWindow(period: Period, now: Date): { from: Date; to: Date } | undefined {
  const since = sinceOf(period, now);

  if (!since) return undefined;

  const span = now.getTime() - since.getTime();

  return { from: new Date(since.getTime() - span), to: since };
}

/**
 * Cuántas veces pasó algo en cada una de las últimas `weeks` semanas, de la más antigua a la actual
 * (la última cubre los 7 días hasta `now`). Lo que es más viejo que eso no se cuenta.
 */
export function weeklyCounts(dates: Date[], now: Date, weeks = 8): number[] {
  const counts = new Array<number>(weeks).fill(0);

  for (const date of dates) {
    const index = weeks - 1 - Math.floor(Math.max(0, now.getTime() - date.getTime()) / (7 * DAY_MS));

    if (index >= 0) {
      counts[index] += 1;
    }
  }

  return counts;
}

export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

export interface SeriesRow {
  bucket: Date;
  enrollments: number;
  completions: number;
}

export interface SeriesPoint {
  /** `2026-10-06` (por día) o `2026-10` (por mes). */
  date: string;
  enrollments: number;
  completions: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

function keyOf(date: Date, bucket: Bucket): string {
  const base = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;

  return bucket === 'month' ? base : `${base}-${pad(date.getUTCDate())}`;
}

/** Inicio del grupo: el día, el lunes de esa semana (como `date_trunc('week')`) o el día 1 del mes. */
function startOf(date: Date, bucket: Bucket): Date {
  if (bucket === 'month') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  if (bucket === 'week') {
    // getUTCDay: 0 = domingo; el lunes es el inicio.
    return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY_MS);
  }

  return day;
}

function next(date: Date, bucket: Bucket): Date {
  if (bucket === 'month') {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  }

  return new Date(date.getTime() + (bucket === 'week' ? 7 : 1) * DAY_MS);
}

/**
 * Completa con ceros los días o meses sin movimiento, para que la gráfica no tenga huecos.
 * Sin `since` (todo el tiempo) arranca en el primer dato; si no hay datos, queda vacía.
 */
export function fillSeries(
  rows: SeriesRow[],
  bucket: Bucket,
  now: Date,
  since?: Date,
): SeriesPoint[] {
  const byKey = new Map(rows.map((r) => [keyOf(r.bucket, bucket), r]));
  const first =
    since ??
    (rows.length > 0
      ? new Date(Math.min(...rows.map((r) => r.bucket.getTime())))
      : undefined);

  if (!first) {
    return [];
  }

  const points: SeriesPoint[] = [];

  for (
    let cursor = startOf(first, bucket);
    cursor.getTime() <= now.getTime();
    cursor = next(cursor, bucket)
  ) {
    const key = keyOf(cursor, bucket);
    const row = byKey.get(key);

    points.push({
      date: key,
      enrollments: row?.enrollments ?? 0,
      completions: row?.completions ?? 0,
    });
  }

  return points;
}

/** Une dos conteos por fecha (inscripciones y finalizaciones) en una sola serie. */
export function mergeSeries(
  enrolled: { bucket: Date; total: number }[],
  completed: { bucket: Date; total: number }[],
  bucket: Bucket,
): SeriesRow[] {
  const merged = new Map<string, SeriesRow>();

  const add = (
    items: { bucket: Date; total: number }[],
    field: 'enrollments' | 'completions',
  ) => {
    for (const item of items) {
      const key = keyOf(item.bucket, bucket);
      const row = merged.get(key) ?? {
        bucket: startOf(item.bucket, bucket),
        enrollments: 0,
        completions: 0,
      };

      row[field] += item.total;
      merged.set(key, row);
    }
  };

  add(enrolled, 'enrollments');
  add(completed, 'completions');

  return [...merged.values()];
}
