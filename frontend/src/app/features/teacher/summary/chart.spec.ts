import {
  compact,
  dateLabel,
  labelIndexes,
  linePath,
  nearestIndex,
  niceScale,
  xPositions,
  yPosition,
} from './chart';

describe('niceScale', () => {
  it('una serie vacía da un eje de 0 a 4', () => {
    expect(niceScale(0)).toEqual({ top: 4, ticks: [0, 1, 2, 3, 4] });
    expect(niceScale(Number.NaN).top).toBe(4);
    expect(niceScale(-3).top).toBe(4);
  });

  it.each([
    [3, 3],
    [7, 8],
    [18, 20],
    [95, 100],
    [1234, 1500],
  ])('máximo %s -> techo %s', (max, top) => {
    expect(niceScale(max).top).toBe(top);
  });

  it('el techo nunca queda por debajo del dato y siempre hay un 0 abajo', () => {
    for (const max of [1, 2, 6, 13, 49, 51, 120, 999, 1234, 87000]) {
      const { top, ticks } = niceScale(max);

      expect(top).toBeGreaterThanOrEqual(max);
      expect(ticks[0]).toBe(0);
      expect(ticks.at(-1)).toBe(top);
    }
  });

  it('las marcas están parejas', () => {
    const { ticks } = niceScale(1234);
    const steps = ticks.slice(1).map((tick, index) => tick - ticks[index]);

    expect(new Set(steps).size).toBe(1);
  });
});

describe('compact', () => {
  it.each([
    [0, '0'],
    [950, '950'],
    [1000, '1 K'],
    [1200, '1,2 K'],
    [12000, '12 K'],
    [1_500_000, '1,5 M'],
  ])('%s -> %s', (value, expected) => expect(compact(value)).toBe(expected));
});

describe('xPositions', () => {
  it('reparte los puntos de forma pareja', () => {
    expect(xPositions(3, 0, 100)).toEqual([0, 50, 100]);
  });

  it('un solo punto va al centro; ninguno, nada', () => {
    expect(xPositions(1, 0, 100)).toEqual([50]);
    expect(xPositions(0, 0, 100)).toEqual([50]);
  });
});

describe('linePath', () => {
  it('traza M y L', () => {
    expect(
      linePath([
        { x: 0, y: 10 },
        { x: 5, y: 2 },
      ]),
    ).toBe('M0.0 10.0 L5.0 2.0');
  });

  it('sin puntos queda vacío', () => {
    expect(linePath([])).toBe('');
  });
});

describe('nearestIndex', () => {
  it('elige la fecha más cercana al cursor', () => {
    const xs = [0, 100, 200, 300];

    expect(nearestIndex(-50, xs)).toBe(0);
    expect(nearestIndex(60, xs)).toBe(1);
    expect(nearestIndex(240, xs)).toBe(2);
    expect(nearestIndex(900, xs)).toBe(3);
  });
});

describe('labelIndexes', () => {
  it('con pocos puntos rotula todos', () => {
    expect(labelIndexes(4, 6)).toEqual([0, 1, 2, 3]);
  });

  it('con muchos, rotula pocos, parejos, incluyendo el primero y el último', () => {
    const picked = labelIndexes(30, 6);

    expect(picked).toHaveLength(6);
    expect(picked[0]).toBe(0);
    expect(picked.at(-1)).toBe(29);
  });
});

describe('dateLabel', () => {
  it('por día y por mes, en español', () => {
    expect(dateLabel('2026-10-06', 'day')).toBe('6 oct');
    expect(dateLabel('2026-10', 'month')).toBe('oct 2026');
    expect(dateLabel('2026-01-31', 'day', true)).toBe('31 de ene de 2026');
  });
});

describe('yPosition', () => {
  it('el cero va abajo y el techo arriba', () => {
    expect(yPosition(0, 10, 20, 220)).toBe(220);
    expect(yPosition(10, 10, 20, 220)).toBe(20);
    expect(yPosition(5, 10, 20, 220)).toBe(120);
  });
});
