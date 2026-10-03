export interface ScorableQuestion {
  id: number;
  points: number;
  options: { id: number; isCorrect: boolean }[];
}

export interface ScoreResult {
  earnedPoints: number;
  totalPoints: number;
  /** Nota de 0 a 100. */
  score: number;
}

/**
 * Califica un intento. `chosen` mapea id de pregunta → id de opción elegida.
 * Una pregunta sin responder vale 0 puntos.
 */
export function scoreAttempt(
  questions: ScorableQuestion[],
  chosen: Map<number, number>,
): ScoreResult {
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

  const earnedPoints = questions.reduce((sum, q) => {
    const optionId = chosen.get(q.id);
    const correct = q.options.find((o) => o.isCorrect);

    return optionId !== undefined && correct?.id === optionId
      ? sum + q.points
      : sum;
  }, 0);

  return {
    earnedPoints,
    totalPoints,
    score:
      totalPoints === 0 ? 0 : Math.round((earnedPoints / totalPoints) * 100),
  };
}
