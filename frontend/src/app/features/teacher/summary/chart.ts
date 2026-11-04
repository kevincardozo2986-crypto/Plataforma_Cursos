/** Cálculos de la gráfica de barras agrupadas del Resumen (sin dibujar nada): escalas, medidas, textos. */

export type Bucket = 'day' | 'week' | 'month';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/**
 * El techo del eje Y y sus marcas, en números redondos (1, 2, 5 × 10ⁿ), con 0 siempre abajo.
 * Una serie vacía da un eje de 0 a 4 para que la gráfica no quede aplastada.
 */
export function niceScale(max: number, wanted = 4): { top: number; ticks: number[] } {
  if (!Number.isFinite(max) || max <= 0) {
    return { top: 4, ticks: [0, 1, 2, 3, 4] };
  }

  const rough = max / wanted;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10]
    .map((factor) => factor * magnitude)
    .find((value) => value >= rough) as number;
  const top = Math.ceil(max / step) * step;

  return {
    top,
    ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step),
  };
}

/** Tres marcas (0, mitad, techo) y enteras: el eje nunca baja de 2 para que 1 o 2 datos no llenen todo el alto. */
export function axisOf(max: number): { top: number; ticks: number[] } {
  return niceScale(Math.max(2, max), 2);
}

/** 0, 950, 1,2 K, 12 K, 1,5 M: compacto desde mil. */
export function compact(value: number): string {
  const abs = Math.abs(value);
  const format = (divided: number, suffix: string) =>
    `${(Math.round(divided * 10) / 10).toString().replace('.', ',')} ${suffix}`;

  if (abs >= 1_000_000) {
    return format(value / 1_000_000, 'M');
  }

  return abs >= 1000 ? format(value / 1000, 'K') : String(value);
}

/**
 * Rótulo de un grupo de la gráfica. `2026-10-06` (día) → «mar 6»; (semana) → «Sem. 6 de oct»;
 * `2026-10` (mes) → «oct». Con `long`, la versión completa para el cuadro flotante y la tabla.
 */
export function bucketLabel(date: string, bucket: Bucket, long = false): string {
  const [year, month, day] = date.split('-').map(Number);
  const name = MONTHS[(month ?? 1) - 1] ?? '';

  if (bucket === 'month') {
    return long ? `${name} ${year}` : name;
  }

  if (bucket === 'week') {
    return long ? `Semana del ${day} de ${name}` : `Sem. ${day} de ${name}`;
  }

  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];

  return long ? `${weekday} ${day} de ${name} de ${year}` : `${weekday} ${day}`;
}

/** Cómo se agrupa: «día», «semana» o «mes» (para «Por semana, dentro del periodo elegido»). */
export function bucketNoun(bucket: Bucket): string {
  return { day: 'día', week: 'semana', month: 'mes' }[bucket];
}

export interface Delta {
  kind: 'up' | 'down' | 'flat';
  amount: number;
}

/** Cuánto cambió respecto al periodo anterior; null si no hay con qué comparar. */
export function deltaOf(now: number, previous: number | null | undefined): Delta | null {
  if (previous === null || previous === undefined) {
    return null;
  }

  const amount = now - previous;

  return { kind: amount > 0 ? 'up' : amount < 0 ? 'down' : 'flat', amount: Math.abs(amount) };
}

/** Trazo de una barra con la punta redondeada (radio `r`) y la base recta, de `base` hacia arriba. */
export function barPath(x: number, base: number, width: number, height: number, r = 4): string {
  const radius = Math.max(0, Math.min(r, height, width / 2));

  return (
    `M${x},${base} v${-(height - radius)} q0,${-radius} ${radius},${-radius} ` +
    `h${width - 2 * radius} q${radius},0 ${radius},${radius} v${height - radius} z`
  );
}

export interface ChartPoint {
  date: string;
  enrollments: number;
  completions: number;
}

export interface BarGroup {
  index: number;
  /** Posición del grupo (ancho completo de su zona). */
  zoneX: number;
  zoneWidth: number;
  /** Centro del grupo, para el rótulo. */
  center: number;
  enrollments: { x: number; height: number; value: number };
  completions: { x: number; height: number; value: number };
  /** El rótulo se omite en una de cada dos cuando hay muchos grupos. */
  showLabel: boolean;
}

export interface ChartLayout {
  top: number;
  ticks: { value: number; y: number; label: string }[];
  groups: BarGroup[];
  barWidth: number;
  base: number;
}

/**
 * Medidas del dibujo: `width`×`height` es el lienzo; `left` deja sitio al eje Y, `bottom` a los rótulos.
 * Cada grupo lleva dos barras (inscripciones y finalizaciones) y su zona de hover.
 */
export function layoutBars(
  series: ChartPoint[],
  size = { width: 820, height: 360, left: 30, right: 0, top: 8, bottom: 28 },
): ChartLayout {
  const { width, height, left, right, top, bottom } = size;
  const max = Math.max(0, ...series.flatMap((point) => [point.enrollments, point.completions]));
  const axis = axisOf(max);
  const base = height - bottom;
  const plotHeight = base - top;
  const zoneWidth = series.length === 0 ? 0 : (width - left - right) / series.length;
  const barWidth = Math.max(2, Math.min(30, (zoneWidth - 12) / 2));
  const heightOf = (value: number) => (value / axis.top) * plotHeight;

  return {
    top: axis.top,
    base,
    barWidth,
    ticks: axis.ticks.map((value) => ({
      value,
      y: base - heightOf(value),
      label: compact(value),
    })),
    groups: series.map((point, index) => {
      const zoneX = left + index * zoneWidth;
      const center = zoneX + zoneWidth / 2;

      return {
        index,
        zoneX,
        zoneWidth,
        center,
        enrollments: { x: center - barWidth - 1, height: heightOf(point.enrollments), value: point.enrollments },
        completions: { x: center + 1, height: heightOf(point.completions), value: point.completions },
        showLabel: series.length <= 8 || index % 2 === 0,
      };
    }),
  };
}
