import {
  normalizeText,
  scoreAttempt,
  scoreOfItems,
  type GivenAnswer,
  type ScorableQuestion,
} from './scoring.js';

const single = (id: number, points: number, correctId: number): ScorableQuestion => ({
  id,
  points,
  type: 'SINGLE',
  options: [
    { id: correctId, text: 'a', isCorrect: true },
    { id: correctId + 1, text: 'b', isCorrect: false },
  ],
});

const multiple: ScorableQuestion = {
  id: 3,
  points: 2,
  type: 'MULTIPLE',
  options: [
    { id: 31, text: 'a', isCorrect: true },
    { id: 32, text: 'b', isCorrect: true },
    { id: 33, text: 'c', isCorrect: false },
  ],
};

const trueFalse: ScorableQuestion = {
  id: 4,
  points: 1,
  type: 'TRUE_FALSE',
  options: [
    { id: 41, text: 'Verdadero', isCorrect: false },
    { id: 42, text: 'Falso', isCorrect: true },
  ],
};

const fill: ScorableQuestion = {
  id: 5,
  points: 1,
  type: 'FILL_BLANK',
  options: [
    { id: 51, text: 'Bogotá', isCorrect: true },
    { id: 52, text: 'Santa Fe de Bogotá', isCorrect: true },
  ],
};

const answers = (entries: [number, GivenAnswer][]) => new Map(entries);

describe('scoreAttempt', () => {
  const questions = [single(1, 1, 10), single(2, 3, 20)];

  it('da 100 si todas las respuestas son correctas', () => {
    const result = scoreAttempt(
      questions,
      answers([
        [1, { optionIds: [10] }],
        [2, { optionIds: [20] }],
      ]),
    );

    expect(result).toMatchObject({ earnedPoints: 4, totalPoints: 4, score: 100 });
  });

  it('pondera la nota por los puntos de cada pregunta', () => {
    // Solo acierta la de 3 puntos: 3 de 4 = 75.
    const result = scoreAttempt(
      questions,
      answers([
        [1, { optionIds: [11] }],
        [2, { optionIds: [20] }],
      ]),
    );

    expect(result.earnedPoints).toBe(3);
    expect(result.score).toBe(75);
  });

  it('una pregunta sin responder vale 0', () => {
    const result = scoreAttempt(questions, answers([[1, { optionIds: [10] }]]));

    expect(result.score).toBe(25);
  });

  it('da 0 si no hay preguntas, sin dividir entre cero', () => {
    expect(scoreAttempt([], new Map()).score).toBe(0);
  });

  it('informa cuáles preguntas se acertaron, sin revelar la opción correcta', () => {
    const result = scoreAttempt(
      questions,
      answers([
        [1, { optionIds: [10] }],
        [2, { optionIds: [21] }],
      ]),
    );

    expect(result.results).toEqual([
      { questionId: 1, correct: true },
      { questionId: 2, correct: false },
    ]);
  });

  describe('verdadero o falso', () => {
    it('acierta con la opción correcta', () => {
      const result = scoreAttempt([trueFalse], answers([[4, { optionIds: [42] }]]));

      expect(result.score).toBe(100);
    });

    it('falla con la incorrecta', () => {
      const result = scoreAttempt([trueFalse], answers([[4, { optionIds: [41] }]]));

      expect(result.score).toBe(0);
    });
  });

  describe('varias respuestas', () => {
    it('acierta solo si marca exactamente las correctas', () => {
      const result = scoreAttempt([multiple], answers([[3, { optionIds: [32, 31] }]]));

      expect(result.score).toBe(100);
    });

    it('no da puntos si falta una correcta', () => {
      const result = scoreAttempt([multiple], answers([[3, { optionIds: [31] }]]));

      expect(result.score).toBe(0);
    });

    it('no da puntos si marca de más una incorrecta', () => {
      const result = scoreAttempt([multiple], answers([[3, { optionIds: [31, 32, 33] }]]));

      expect(result.score).toBe(0);
    });
  });

  describe('completar palabra', () => {
    it('acepta cualquiera de las respuestas válidas', () => {
      expect(scoreAttempt([fill], answers([[5, { text: 'Bogotá' }]])).score).toBe(100);
      expect(
        scoreAttempt([fill], answers([[5, { text: 'Santa Fe de Bogotá' }]])).score,
      ).toBe(100);
    });

    it('ignora mayúsculas, tildes y espacios de más', () => {
      expect(scoreAttempt([fill], answers([[5, { text: '  BOGOTA ' }]])).score).toBe(100);
    });

    it('rechaza una respuesta distinta o vacía', () => {
      expect(scoreAttempt([fill], answers([[5, { text: 'Medellín' }]])).score).toBe(0);
      expect(scoreAttempt([fill], answers([[5, { text: '   ' }]])).score).toBe(0);
    });
  });
});

describe('preguntas abiertas (ESSAY)', () => {
  const essay: ScorableQuestion = { id: 6, points: 4, type: 'ESSAY', options: [] };

  it('con texto queda pendiente de revisión y no suma todavía', () => {
    const result = scoreAttempt([single(1, 1, 10), essay], answers([
      [1, { optionIds: [10] }],
      [6, { text: 'Mi ensayo' }],
    ]));

    expect(result.results).toEqual([
      { questionId: 1, correct: true },
      { questionId: 6, correct: null },
    ]);
    expect(result.pendingReview).toBe(true);
    expect(result.earnedPoints).toBe(1);
    expect(result.totalPoints).toBe(5);
    expect(result.score).toBe(20); // provisional
  });

  it('sin responder (o en blanco) vale 0 y no necesita revisión', () => {
    const blank = scoreAttempt([essay], answers([[6, { text: '   ' }]]));
    const missing = scoreAttempt([essay], new Map());

    expect(blank.pendingReview).toBe(false);
    expect(missing.pendingReview).toBe(false);
    expect(missing.results).toEqual([{ questionId: 6, correct: false }]);
  });

  it('un quiz sin preguntas abiertas no queda pendiente', () => {
    expect(scoreAttempt([single(1, 1, 10)], answers([[1, { optionIds: [10] }]])).pendingReview).toBe(false);
  });
});

describe('scoreOfItems', () => {
  it('suma lo obtenido y trata lo pendiente como 0', () => {
    const result = scoreOfItems([
      { questionId: 1, points: 1, earned: 1 },
      { questionId: 2, points: 4, earned: null },
    ]);

    expect(result).toEqual({ earnedPoints: 1, totalPoints: 5, score: 20 });
  });

  it('con la nota del docente completa la calificación', () => {
    const result = scoreOfItems([
      { questionId: 1, points: 1, earned: 1 },
      { questionId: 2, points: 4, earned: 3 },
    ]);

    expect(result.score).toBe(80);
  });

  it('sin preguntas da 0, sin dividir entre cero', () => {
    expect(scoreOfItems([]).score).toBe(0);
  });
});

describe('normalizeText', () => {
  it('quita tildes, baja a minúsculas y junta espacios', () => {
    expect(normalizeText('  Árbol   Ñandú ')).toBe('arbol nandu');
  });
});
