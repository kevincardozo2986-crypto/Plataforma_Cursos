import {
  axisOf,
  barPath,
  bucketLabel,
  bucketNoun,
  compact,
  deltaOf,
  layoutBars,
  niceScale,
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
});

describe('axisOf', () => {
  it('nunca baja de 2 y da 3 marcas enteras con pocos datos', () => {
    expect(axisOf(0)).toEqual({ top: 2, ticks: [0, 1, 2] });
    expect(axisOf(1)).toEqual({ top: 2, ticks: [0, 1, 2] });
    expect(axisOf(4)).toEqual({ top: 4, ticks: [0, 2, 4] });
  });

  it('el techo cubre el dato', () => {
    for (const max of [2, 3, 7, 15, 99, 1000]) {
      expect(axisOf(max).top).toBeGreaterThanOrEqual(max);
    }
  });
});

describe('compact', () => {
  it.each([
    [0, '0'],
    [950, '950'],
    [1200, '1,2 K'],
    [12000, '12 K'],
    [1_500_000, '1,5 M'],
  ])('%s -> %s', (value, text) => {
    expect(compact(value)).toBe(text);
  });
});

describe('bucketLabel', () => {
  it('día: día de la semana y número', () => {
    expect(bucketLabel('2026-10-06', 'day')).toBe('mar 6');
    expect(bucketLabel('2026-10-06', 'day', true)).toBe('mar 6 de oct de 2026');
  });

  it('semana: la fecha del lunes', () => {
    expect(bucketLabel('2026-10-05', 'week')).toBe('Sem. 5 de oct');
    expect(bucketLabel('2026-10-05', 'week', true)).toBe('Semana del 5 de oct');
  });

  it('mes: corto en el eje y con año en el cuadro', () => {
    expect(bucketLabel('2026-10', 'month')).toBe('oct');
    expect(bucketLabel('2026-10', 'month', true)).toBe('oct 2026');
  });

  it('bucketNoun nombra la agrupación', () => {
    expect([bucketNoun('day'), bucketNoun('week'), bucketNoun('month')]).toEqual(['día', 'semana', 'mes']);
  });
});

describe('deltaOf', () => {
  it('sube, baja o queda igual', () => {
    expect(deltaOf(5, 3)).toEqual({ kind: 'up', amount: 2 });
    expect(deltaOf(2, 6)).toEqual({ kind: 'down', amount: 4 });
    expect(deltaOf(4, 4)).toEqual({ kind: 'flat', amount: 0 });
  });

  it('sin periodo anterior no hay variación', () => {
    expect(deltaOf(4, null)).toBeNull();
    expect(deltaOf(4, undefined)).toBeNull();
  });
});

describe('barPath', () => {
  it('dibuja una barra cerrada con la punta redondeada', () => {
    const path = barPath(10, 100, 20, 50);

    expect(path.startsWith('M10,100')).toBe(true);
    expect(path.endsWith('z')).toBe(true);
    expect(path).toContain('q0,-4');
  });

  it('una barra muy baja reduce el radio para no salirse', () => {
    expect(barPath(0, 10, 20, 2)).toContain('q0,-2');
  });
});

describe('layoutBars', () => {
  const series = [
    { date: '2026-10-05', enrollments: 1, completions: 0 },
    { date: '2026-10-12', enrollments: 4, completions: 2 },
  ];

  it('una zona por punto y barras proporcionales al techo del eje', () => {
    const layout = layoutBars(series);

    expect(layout.groups).toHaveLength(2);
    expect(layout.top).toBe(4);
    expect(layout.groups[1].enrollments.height).toBeGreaterThan(layout.groups[1].completions.height);
    // El máximo llena justo el alto útil.
    expect(layout.groups[1].enrollments.height).toBeCloseTo(layout.base - 8, 5);
    expect(layout.groups[0].completions.height).toBe(0);
  });

  it('las marcas del eje van de abajo hacia arriba', () => {
    const { ticks, base } = layoutBars(series);

    expect(ticks.map((tick) => tick.value)).toEqual([0, 2, 4]);
    expect(ticks[0].y).toBe(base);
    expect(ticks[2].y).toBeLessThan(ticks[1].y);
  });

  it('con muchos grupos solo se rotula uno de cada dos', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      date: `2026-${String(i + 1).padStart(2, '0')}`,
      enrollments: i,
      completions: 0,
    }));
    const labels = layoutBars(many).groups.map((group) => group.showLabel);

    expect(labels.filter(Boolean)).toHaveLength(6);
  });

  it('una serie vacía no rompe y deja un eje de 0 a 2', () => {
    const layout = layoutBars([]);

    expect(layout.groups).toEqual([]);
    expect(layout.top).toBe(2);
  });
});
