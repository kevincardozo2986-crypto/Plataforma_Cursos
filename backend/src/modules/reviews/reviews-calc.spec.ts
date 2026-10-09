import { publicName, summarizeRatings, weightedAverage } from './reviews-calc.js';

describe('summarizeRatings', () => {
  it('calcula el promedio con un decimal y la distribución', () => {
    const summary = summarizeRatings([
      { rating: 5, count: 6 },
      { rating: 4, count: 3 },
      { rating: 1, count: 1 },
    ]);

    // (30 + 12 + 1) / 10 = 4,3
    expect(summary).toEqual({
      average: 4.3,
      count: 10,
      distribution: { '1': 1, '2': 0, '3': 0, '4': 3, '5': 6 },
    });
  });

  it('redondea el promedio', () => {
    // (5 + 4 + 4) / 3 = 4,333…
    expect(summarizeRatings([{ rating: 5, count: 1 }, { rating: 4, count: 2 }]).average).toBe(4.3);
    // (5 + 5 + 4) / 3 = 4,666…
    expect(summarizeRatings([{ rating: 5, count: 2 }, { rating: 4, count: 1 }]).average).toBe(4.7);
  });

  it('sin reseñas el promedio es null y no se divide entre cero', () => {
    expect(summarizeRatings([])).toEqual({
      average: null,
      count: 0,
      distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    });
  });

  it('ignora calificaciones fuera de 1 a 5', () => {
    expect(summarizeRatings([{ rating: 9, count: 4 }, { rating: 3, count: 1 }]).count).toBe(1);
  });
});

describe('weightedAverage', () => {
  it('pondera cada promedio por su cantidad de reseñas', () => {
    // Un curso de 9 reseñas con 5,0 pesa más que uno de 1 reseña con 1,0: (45 + 1) / 10 = 4,6
    expect(weightedAverage([{ average: 5, count: 9 }, { average: 1, count: 1 }])).toBe(4.6);
  });

  it('sin reseñas devuelve null', () => {
    expect(weightedAverage([])).toBeNull();
    expect(weightedAverage([{ average: 4, count: 0 }])).toBeNull();
  });
});

describe('publicName', () => {
  it('muestra el nombre y la inicial del apellido', () => {
    expect(publicName('Ana', 'Ruiz Pérez')).toBe('Ana R.');
    expect(publicName(' Luis ', ' garcía')).toBe('Luis G.');
  });

  it('sin apellido muestra solo el nombre', () => {
    expect(publicName('Ana', '  ')).toBe('Ana');
  });
});
