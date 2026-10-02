import { scoreAttempt, type ScorableQuestion } from './scoring.js';

const question = (
  id: number,
  points: number,
  correctOptionId: number,
): ScorableQuestion => ({
  id,
  points,
  options: [
    { id: correctOptionId, isCorrect: true },
    { id: correctOptionId + 1, isCorrect: false },
  ],
});

describe('scoreAttempt', () => {
  const questions = [question(1, 1, 10), question(2, 3, 20)];

  it('da 100 si todas las respuestas son correctas', () => {
    const result = scoreAttempt(questions, new Map([[1, 10], [2, 20]]));

    expect(result).toEqual({ earnedPoints: 4, totalPoints: 4, score: 100 });
  });

  it('pondera la nota por los puntos de cada pregunta', () => {
    // Solo acierta la de 3 puntos: 3 de 4 = 75.
    const result = scoreAttempt(questions, new Map([[1, 11], [2, 20]]));

    expect(result.earnedPoints).toBe(3);
    expect(result.score).toBe(75);
  });

  it('una pregunta sin responder vale 0', () => {
    const result = scoreAttempt(questions, new Map([[1, 10]]));

    expect(result.score).toBe(25);
  });

  it('da 0 si no hay preguntas, sin dividir entre cero', () => {
    expect(scoreAttempt([], new Map()).score).toBe(0);
  });
});
