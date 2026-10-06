import { BadRequestException } from '@nestjs/common';

import {
  assertCanSubmit,
  assertHasContent,
  assertValidScore,
  isLate,
} from './submission-rules.js';

const due = new Date('2026-10-10T12:00:00.000Z');
const before = new Date('2026-10-09T12:00:00.000Z');
const after = new Date('2026-10-11T12:00:00.000Z');

describe('isLate', () => {
  it('sin fecha límite nunca es tardía', () => {
    expect(isLate(null, after)).toBe(false);
  });

  it('es tardía solo después de la fecha límite', () => {
    expect(isLate(due, before)).toBe(false);
    expect(isLate(due, due)).toBe(false); // justo a tiempo
    expect(isLate(due, after)).toBe(true);
  });
});

describe('assertCanSubmit', () => {
  it('a tiempo se acepta y no es tardía', () => {
    expect(assertCanSubmit({ dueAt: due, allowLate: false }, undefined, before)).toBe(false);
  });

  it('tardía con entregas tardías permitidas: se acepta y se marca como tardía', () => {
    expect(assertCanSubmit({ dueAt: due, allowLate: true }, undefined, after)).toBe(true);
  });

  it('tardía sin entregas tardías permitidas: se rechaza', () => {
    expect(() => assertCanSubmit({ dueAt: due, allowLate: false }, undefined, after)).toThrow(
      BadRequestException,
    );
  });

  it('una entrega calificada ya no se puede cambiar', () => {
    expect(() => assertCanSubmit({ dueAt: null, allowLate: true }, 'GRADED', before)).toThrow(
      BadRequestException,
    );
  });

  it('una entrega pendiente sí se puede reenviar', () => {
    expect(assertCanSubmit({ dueAt: null, allowLate: true }, 'SUBMITTED', before)).toBe(false);
  });
});

describe('assertHasContent', () => {
  it('acepta texto, archivos o ambos', () => {
    expect(() => assertHasContent('Mi respuesta', 0)).not.toThrow();
    expect(() => assertHasContent(undefined, 1)).not.toThrow();
    expect(() => assertHasContent('texto', 2)).not.toThrow();
  });

  it('rechaza una entrega vacía o solo con espacios', () => {
    expect(() => assertHasContent(undefined, 0)).toThrow(BadRequestException);
    expect(() => assertHasContent('   ', 0)).toThrow(BadRequestException);
  });
});

describe('assertValidScore', () => {
  it('acepta de 0 al máximo, ambos incluidos', () => {
    expect(() => assertValidScore(0, 100)).not.toThrow();
    expect(() => assertValidScore(100, 100)).not.toThrow();
  });

  it('rechaza negativas, mayores al máximo y decimales', () => {
    for (const score of [-1, 101, 7.5]) {
      expect(() => assertValidScore(score, 100)).toThrow(BadRequestException);
    }
  });
});
