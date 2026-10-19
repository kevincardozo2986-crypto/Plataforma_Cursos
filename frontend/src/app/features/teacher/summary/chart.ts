/** Cálculos de la gráfica de líneas (sin dibujar nada): escalas, marcas de los ejes y textos. */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

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

/** 0, 950, 1,2 K, 12 K, 1,5 M: compacto desde mil, como las marcas del eje. */
export function compact(value: number): string {
  const abs = Math.abs(value);
  const format = (divided: number, suffix: string) =>
    `${(Math.round(divided * 10) / 10).toString().replace('.', ',')} ${suffix}`;

  if (abs >= 1_000_000) {
    return format(value / 1_000_000, 'M');
  }

  return abs >= 1000 ? format(value / 1000, 'K') : String(value);
}

/** Posición horizontal de cada punto, repartidos de forma pareja entre `left` y `right`. */
export function xPositions(count: number, left: number, right: number): number[] {
  if (count <= 1) {
    return [(left + right) / 2];
  }

  return Array.from({ length: count }, (_, index) => left + ((right - left) * index) / (count - 1));
}

/** Altura en pantalla de un valor: `bottom` es el cero (abajo) y `top`, el techo del eje (arriba). */
export function yPosition(value: number, scaleTop: number, top: number, bottom: number): number {
  return bottom - ((bottom - top) * value) / scaleTop;
}

/** El trazo de una línea: `M x y L x y …`. */
export function linePath(points: { x: number; y: number }[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
}

/** El índice del punto más cercano a `x` (para que el cursor "se pegue" a una fecha). */
export function nearestIndex(x: number, xs: number[]): number {
  let best = 0;

  xs.forEach((position, index) => {
    if (Math.abs(position - x) < Math.abs(xs[best] - x)) {
      best = index;
    }
  });

  return best;
}

/** Qué puntos llevan rótulo en el eje X: pocos y parejos, siempre el primero y el último. */
export function labelIndexes(count: number, maxLabels: number): number[] {
  if (count <= maxLabels) {
    return Array.from({ length: count }, (_, index) => index);
  }

  const picked = new Set<number>();

  for (let slot = 0; slot < maxLabels; slot += 1) {
    picked.add(Math.round((slot * (count - 1)) / (maxLabels - 1)));
  }

  return [...picked];
}

/** `2026-10-06` → «6 oct»; `2026-10` → «oct 2026». Con `long`, el día de la semana no se usa: solo la fecha completa. */
export function dateLabel(date: string, bucket: 'day' | 'month', long = false): string {
  const [year, month, day] = date.split('-').map(Number);
  const name = MONTHS[(month ?? 1) - 1] ?? '';

  if (bucket === 'month') {
    return `${name} ${year}`;
  }

  return long ? `${day} de ${name} de ${year}` : `${day} ${name}`;
}
