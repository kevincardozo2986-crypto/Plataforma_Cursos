import { StudentRow } from '../../../core/dashboard/analytics.service';

/** Los cuatro estados que ve el docente: terminó, en progreso, inactivo (≥30 días sin avanzar) y sin empezar. */
export type IxState = 'done' | 'prog' | 'idle' | 'new';

export const IX_ORDER: IxState[] = ['done', 'prog', 'idle', 'new'];

/** Nombre en singular (para la insignia de cada fila). */
export const IX_LABELS: Record<IxState, string> = {
  done: 'Terminó',
  prog: 'En progreso',
  idle: 'Inactivo',
  new: 'Sin empezar',
};

/** Nombre en plural (para la leyenda del grupo). */
export const IX_GROUP: Record<IxState, string> = {
  done: 'Terminaron',
  prog: 'En progreso',
  idle: 'Inactivos',
  new: 'Sin empezar',
};

export type IxColor = 'blue' | 'teal' | 'sand' | 'green';
export const IX_COLORS: IxColor[] = ['blue', 'teal', 'sand', 'green'];

export type SortKey = 'name' | 'pct' | 'days';
export type SortDir = 'asc' | 'desc';

export interface IxRow extends StudentRow {
  ix: IxState;
  /** Días desde su última lección completada; null si nunca avanzó. */
  days: number | null;
  name: string;
  ini: string;
  color: IxColor;
  pct: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * El servidor distingue «terminó», «en progreso» e «inactivo». Aquí se separa además «sin empezar»: quien no
 * completó ninguna lección ni tiene actividad (aunque lleve tiempo inscrito).
 */
export function classify(row: Pick<StudentRow, 'state' | 'progress' | 'lastActivityAt'>): IxState {
  if (row.state === 'COMPLETED') return 'done';
  if (row.progress.completed === 0 && !row.lastActivityAt) return 'new';

  return row.state === 'INACTIVE' ? 'idle' : 'prog';
}

export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;

  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
}

export function initialsOf(firstName: string, lastName: string): string {
  return ((firstName.trim()[0] ?? '') + (lastName.trim()[0] ?? '')).toUpperCase() || '?';
}

/** Un color estable por persona (según su correo), para que su ficha no cambie de color entre visitas. */
export function colorOf(email: string): IxColor {
  const hash = [...email].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0);

  return IX_COLORS[hash % IX_COLORS.length];
}

export function toIxRow(row: StudentRow, now: Date): IxRow {
  return {
    ...row,
    ix: classify(row),
    days: daysSince(row.lastActivityAt, now),
    name: `${row.student.firstName} ${row.student.lastName}`.trim(),
    ini: initialsOf(row.student.firstName, row.student.lastName),
    color: colorOf(row.student.email),
    pct: row.progress.percent,
  };
}

/** «Hoy», «Ayer», «Hace 5 días» o «Sin actividad». */
export function whenLabel(days: number | null): string {
  if (days === null) return 'Sin actividad';
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';

  return `Hace ${days} días`;
}

/** Ordena una copia. En «última actividad», lo más reciente primero (asc); quien nunca avanzó queda al final. */
export function sortRows(rows: IxRow[], key: SortKey, dir: SortDir): IxRow[] {
  const sign = dir === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    if (key === 'name') return a.name.localeCompare(b.name, 'es') * sign;
    if (key === 'pct') return (a.pct - b.pct) * sign;

    return ((a.days ?? Infinity) - (b.days ?? Infinity) || 0) * sign || a.name.localeCompare(b.name, 'es');
  });
}

/** ¿Coincide el nombre o el correo con lo que se escribió en el buscador? */
export function matchesQuery(row: IxRow, query: string): boolean {
  const q = query.trim().toLowerCase();

  return !q || `${row.name} ${row.student.email}`.toLowerCase().includes(q);
}

export function averagePct(rows: IxRow[]): number {
  return rows.length === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + row.pct, 0) / rows.length);
}

/**
 * Quiénes necesitan un empujón: inactivos o sin empezar a los que todavía no se les recordó. Primero quien nunca
 * empezó y luego quien lleva más días sin avanzar.
 */
export function riskOf(rows: IxRow[], reminded: ReadonlySet<number>, max = 3): IxRow[] {
  return rows
    .filter((row) => (row.ix === 'idle' || row.ix === 'new') && !reminded.has(row.enrollmentId))
    .sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity) || a.name.localeCompare(b.name, 'es'))
    .slice(0, max);
}

/** Cuántos hay de cada estado. */
export function countByState(rows: IxRow[]): Record<IxState, number> {
  const counts: Record<IxState, number> = { done: 0, prog: 0, idle: 0, new: 0 };

  for (const row of rows) counts[row.ix] += 1;

  return counts;
}
