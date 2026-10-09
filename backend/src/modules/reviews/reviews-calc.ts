export interface RatingCount {
  rating: number;
  count: number;
}

export interface RatingSummary {
  /** Promedio con un decimal, o `null` si todavía no hay reseñas. */
  average: number | null;
  count: number;
  /** Cuántas reseñas hay de cada calificación, de 1 a 5. */
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

const redondear = (value: number) => Math.round(value * 10) / 10;

/** Promedio y distribución a partir de cuántas reseñas hay de cada calificación. */
export function summarizeRatings(counts: RatingCount[]): RatingSummary {
  const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let count = 0;
  let sum = 0;

  for (const { rating, count: n } of counts) {
    if (rating >= 1 && rating <= 5) {
      distribution[String(rating) as keyof typeof distribution] += n;
      count += n;
      sum += rating * n;
    }
  }

  return {
    average: count === 0 ? null : redondear(sum / count),
    count,
    distribution,
  };
}

/** Promedio ponderado de varios promedios, cada uno con su cantidad de reseñas. */
export function weightedAverage(
  items: { average: number; count: number }[],
): number | null {
  const count = items.reduce((total, item) => total + item.count, 0);

  return count === 0
    ? null
    : redondear(
        items.reduce((total, item) => total + item.average * item.count, 0) /
          count,
      );
}

/** "Ana Ruiz Pérez" -> "Ana R.": en la vista pública no se muestra el apellido completo. */
export function publicName(firstName: string, lastName: string): string {
  const initial = lastName.trim().charAt(0).toUpperCase();

  return initial ? `${firstName.trim()} ${initial}.` : firstName.trim();
}
