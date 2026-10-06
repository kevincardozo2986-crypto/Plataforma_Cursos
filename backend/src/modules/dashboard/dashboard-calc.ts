export const PERIODS = ['7d', '30d', '90d', '1y', 'all'] as const;
export type Period = (typeof PERIODS)[number];

export type Bucket = 'day' | 'month';

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

/** Los periodos cortos se grafican por día; los largos, por mes. */
export function bucketOf(period: Period): Bucket {
  return period === 'all' || period === '1y' ? 'month' : 'day';
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

function startOf(date: Date, bucket: Bucket): Date {
  return bucket === 'month'
    ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    : new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
      );
}

function next(date: Date, bucket: Bucket): Date {
  return bucket === 'month'
    ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
    : new Date(date.getTime() + DAY_MS);
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
