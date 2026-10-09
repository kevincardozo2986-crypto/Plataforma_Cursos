import {
  computeAvailability,
  createsCycle,
  type DripModule,
  lockMessage,
} from './drip.js';

const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

const module = (id: number, overrides: Partial<DripModule> = {}): DripModule => ({
  id,
  title: `Módulo ${id}`,
  position: id,
  unlockAt: null,
  unlockAfterDays: null,
  requires: [],
  ...overrides,
});

const context = (completed: number[] = [], now = '2026-10-10') => ({
  now: at(now),
  enrolledAt: at('2026-10-01'),
  completed: new Set(completed),
});

const locked = (result: ReturnType<typeof computeAvailability>) =>
  result.filter((m) => m.locked).map((m) => m.moduleId);

describe('computeAvailability', () => {
  const modules = [module(1), module(2), module(3)];

  it('NONE: todo abierto, aunque los módulos tengan ajustes', () => {
    const configured = [module(1, { unlockAt: at('2030-01-01') }), module(2, { requires: [1] })];

    expect(locked(computeAvailability('NONE', configured, context()))).toEqual([]);
  });

  describe('BY_DATE', () => {
    const dated = [
      module(1, { unlockAt: at('2026-10-05') }),
      module(2, { unlockAt: at('2026-10-20') }),
      module(3),
    ];

    it('cierra los módulos cuya fecha aún no llega, y dice cuándo se abren', () => {
      const result = computeAvailability('BY_DATE', dated, context());

      expect(locked(result)).toEqual([2]);
      expect(result[1]).toMatchObject({ reason: 'DATE', unlocksAt: at('2026-10-20') });
    });

    it('un módulo sin fecha queda abierto', () => {
      expect(computeAvailability('BY_DATE', dated, context())[2].locked).toBe(false);
    });

    it('al llegar la fecha se abre', () => {
      expect(locked(computeAvailability('BY_DATE', dated, context([], '2026-10-20')))).toEqual([]);
    });
  });

  describe('AFTER_DAYS', () => {
    const delayed = [module(1, { unlockAfterDays: 0 }), module(2, { unlockAfterDays: 14 }), module(3)];

    it('se abre tantos días después de la inscripción', () => {
      const result = computeAvailability('AFTER_DAYS', delayed, context());

      // Inscrito el 1 de octubre: el módulo 2 se abre el 15.
      expect(locked(result)).toEqual([2]);
      expect(result[1]).toMatchObject({ reason: 'DAYS', unlocksAt: at('2026-10-15') });
    });

    it('con 0 días se abre de inmediato; sin ajuste, también', () => {
      const result = computeAvailability('AFTER_DAYS', delayed, context());

      expect(result[0].locked).toBe(false);
      expect(result[2].locked).toBe(false);
    });

    it('cada alumno cuenta desde SU inscripción', () => {
      const late = { ...context(), enrolledAt: at('2026-10-09') };

      expect(locked(computeAvailability('AFTER_DAYS', delayed, late))).toEqual([2]);
      expect(computeAvailability('AFTER_DAYS', delayed, late)[1].unlocksAt).toEqual(at('2026-10-23'));
    });
  });

  describe('SEQUENTIAL', () => {
    it('solo el primero está abierto al empezar', () => {
      expect(locked(computeAvailability('SEQUENTIAL', modules, context()))).toEqual([2, 3]);
    });

    it('terminar un módulo abre el siguiente, y solo ese', () => {
      const result = computeAvailability('SEQUENTIAL', modules, context([1]));

      expect(locked(result)).toEqual([3]);
      expect(result[2]).toMatchObject({ reason: 'PREVIOUS', requiredModules: [{ id: 2, title: 'Módulo 2' }] });
    });

    it('sigue el orden por posición, no por id', () => {
      const shuffled = [module(1, { position: 3 }), module(2, { position: 1 }), module(3, { position: 2 })];

      // El primero es el id 2 (posición 1); el id 1 va último.
      expect(locked(computeAvailability('SEQUENTIAL', shuffled, context()))).toEqual([3, 1]);
    });
  });

  describe('PREREQUISITES', () => {
    const gated = [module(1), module(2, { requires: [1] }), module(3, { requires: [1, 2] })];

    it('un módulo se abre al terminar todos los que pide', () => {
      expect(locked(computeAvailability('PREREQUISITES', gated, context()))).toEqual([2, 3]);
      expect(locked(computeAvailability('PREREQUISITES', gated, context([1])))).toEqual([3]);
      expect(locked(computeAvailability('PREREQUISITES', gated, context([1, 2])))).toEqual([]);
    });

    it('dice cuáles faltan, solo los pendientes', () => {
      const result = computeAvailability('PREREQUISITES', gated, context([1]));

      expect(result[2].requiredModules).toEqual([{ id: 2, title: 'Módulo 2' }]);
    });

    it('un módulo sin prerrequisitos está abierto', () => {
      expect(computeAvailability('PREREQUISITES', gated, context())[0].locked).toBe(false);
    });
  });
});

describe('lockMessage', () => {
  const [byDate] = computeAvailability('BY_DATE', [module(1, { unlockAt: at('2026-10-20') })], context());
  const [previous] = computeAvailability('SEQUENTIAL', [module(1), module(2)], context()).slice(1);
  const [, prereq] = computeAvailability('PREREQUISITES', [module(1), module(2, { requires: [1] })], context());

  it('por fecha: dice el día en español', () => {
    expect(lockMessage(byDate)).toBe('Este contenido se desbloquea el 20 de octubre de 2026');
  });

  it('por módulo anterior o prerrequisitos: nombra lo que falta', () => {
    expect(lockMessage(previous)).toBe('Termina el módulo anterior («Módulo 1») para desbloquear este contenido');
    expect(lockMessage(prereq)).toBe('Termina antes: «Módulo 1»');
  });
});

describe('createsCycle', () => {
  // 2 pide a 1; 3 pide a 2.
  const graph = new Map([[2, [1]], [3, [2]]]);

  it('pedirse a sí mismo es un círculo', () => {
    expect(createsCycle(1, [1], graph)).toBe(true);
  });

  it('A pide B y B pide A es un círculo', () => {
    expect(createsCycle(1, [2], graph)).toBe(true);
  });

  it('también los círculos largos: 1 pide 3, 3 pide 2, 2 pide 1', () => {
    expect(createsCycle(1, [3], graph)).toBe(true);
  });

  it('una dependencia válida no lo es', () => {
    expect(createsCycle(4, [3, 1], graph)).toBe(false);
    expect(createsCycle(3, [1], graph)).toBe(false);
  });

  it('reemplazar los requisitos de un módulo no cuenta los anteriores', () => {
    // 2 pedía a 1; ahora pide a nadie, y 1 puede pedir a 2.
    expect(createsCycle(2, [], graph)).toBe(false);
    expect(createsCycle(1, [2], new Map([[3, [2]]]))).toBe(false);
  });
});
