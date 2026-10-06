import { BadRequestException } from '@nestjs/common';

import {
  applyGrades,
  buildSnapshot,
  pendingEssays,
  summarize,
  type SnapshotQuestion,
} from './attempt-snapshot.js';
import { scoreAttempt } from './scoring.js';

const questions: SnapshotQuestion[] = [
  {
    id: 1,
    text: 'Capital de Colombia',
    points: 1,
    type: 'SINGLE',
    options: [
      { id: 11, text: 'Bogotá', isCorrect: true },
      { id: 12, text: 'Lima', isCorrect: false },
    ],
  },
  {
    id: 2,
    text: 'Explica qué es una API',
    points: 4,
    type: 'ESSAY',
    options: [],
  },
];

function snapshotOf(essay: string, choice = 11) {
  const given = new Map([
    [1, { optionIds: [choice] }],
    [2, { text: essay }],
  ]);

  return buildSnapshot(questions, given, scoreAttempt(questions, given).results);
}

describe('buildSnapshot', () => {
  it('guarda texto, lo respondido y lo esperado de cada pregunta', () => {
    const [choice, essay] = snapshotOf('Una interfaz');

    expect(choice).toMatchObject({
      questionId: 1,
      text: 'Capital de Colombia',
      chosen: ['Bogotá'],
      expected: ['Bogotá'],
      correct: true,
      earned: 1,
    });
    expect(essay).toMatchObject({ type: 'ESSAY', written: 'Una interfaz', correct: null, earned: null });
    expect(essay.expected).toBeUndefined();
  });

  it('una respuesta incorrecta suma 0', () => {
    expect(snapshotOf('x', 12)[0]).toMatchObject({ correct: false, earned: 0, chosen: ['Lima'] });
  });
});

describe('applyGrades', () => {
  it('califica la pregunta abierta y deja el original intacto', () => {
    const items = snapshotOf('Una interfaz');
    const graded = applyGrades(items, [{ questionId: 2, points: 3, comment: 'Falta detalle' }]);

    expect(graded[1]).toMatchObject({ earned: 3, correct: false, graded: true, comment: 'Falta detalle' });
    expect(items[1].earned).toBeNull();
  });

  it('puntaje completo cuenta como correcta', () => {
    expect(applyGrades(snapshotOf('x'), [{ questionId: 2, points: 4 }])[1].correct).toBe(true);
  });

  it('se puede corregir una nota ya puesta', () => {
    const first = applyGrades(snapshotOf('x'), [{ questionId: 2, points: 1 }]);
    const second = applyGrades(first, [{ questionId: 2, points: 4 }]);

    expect(second[1].earned).toBe(4);
  });

  it('rechaza puntos fuera de rango, decimales o negativos', () => {
    const items = snapshotOf('x');

    for (const points of [5, -1, 2.5]) {
      expect(() => applyGrades(items, [{ questionId: 2, points }])).toThrow(BadRequestException);
    }
  });

  it('rechaza calificar una pregunta que no es abierta o no existe', () => {
    const items = snapshotOf('x');

    expect(() => applyGrades(items, [{ questionId: 1, points: 1 }])).toThrow(BadRequestException);
    expect(() => applyGrades(items, [{ questionId: 99, points: 1 }])).toThrow(BadRequestException);
  });

  it('rechaza calificar una abierta que el estudiante dejó en blanco', () => {
    expect(() => applyGrades(snapshotOf('   '), [{ questionId: 2, points: 1 }])).toThrow(BadRequestException);
  });

  it('rechaza la misma pregunta dos veces', () => {
    expect(() =>
      applyGrades(snapshotOf('x'), [
        { questionId: 2, points: 1 },
        { questionId: 2, points: 2 },
      ]),
    ).toThrow(BadRequestException);
  });
});

describe('summarize', () => {
  it('mientras haya una abierta sin calificar queda pendiente y no aprueba', () => {
    const items = snapshotOf('x');
    const result = summarize(items, 60);

    expect(pendingEssays(items)).toHaveLength(1);
    expect(result).toMatchObject({ pending: true, passed: false, score: 20 });
  });

  it('al calificar todo, calcula la nota final y decide si aprueba', () => {
    const approved = summarize(applyGrades(snapshotOf('x'), [{ questionId: 2, points: 4 }]), 60);
    const failed = summarize(applyGrades(snapshotOf('x'), [{ questionId: 2, points: 0 }]), 60);

    expect(approved).toMatchObject({ pending: false, score: 100, passed: true });
    expect(failed).toMatchObject({ pending: false, score: 20, passed: false });
  });
});
