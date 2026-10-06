export type QuestionKind =
  | 'TRUE_FALSE'
  | 'SINGLE'
  | 'MULTIPLE'
  | 'FILL_BLANK'
  | 'ESSAY';

export interface ScorableQuestion {
  id: number;
  points: number;
  type: QuestionKind;
  /** FILL_BLANK: cada opción es una respuesta aceptada. */
  options: { id: number; text: string; isCorrect: boolean }[];
}

/** Lo que respondió el estudiante: opciones elegidas o, en FILL_BLANK, un texto. */
export interface GivenAnswer {
  optionIds?: number[];
  text?: string;
}

export interface QuestionResult {
  questionId: number;
  /** `null` en una pregunta abierta: la califica el docente. */
  correct: boolean | null;
}

export interface ScoreResult {
  /** Puntos de las preguntas que se corrigen solas (las abiertas aún no suman). */
  earnedPoints: number;
  totalPoints: number;
  /** Nota provisional de 0 a 100, sin contar las preguntas abiertas pendientes. */
  score: number;
  results: QuestionResult[];
  /** ¿Hay respuestas abiertas esperando que el docente las califique? */
  pendingReview: boolean;
}

/** Una pregunta del intento ya calificada (o pendiente) para guardar o recalcular. */
export interface GradedItem {
  questionId: number;
  points: number;
  /** Puntos obtenidos; `null` mientras la pregunta abierta espera calificación. */
  earned: number | null;
}

/** Nota de 0 a 100 a partir de lo calificado; lo pendiente cuenta 0. */
export function scoreOfItems(items: GradedItem[]) {
  const totalPoints = items.reduce((sum, i) => sum + i.points, 0);
  const earnedPoints = items.reduce((sum, i) => sum + (i.earned ?? 0), 0);

  return {
    earnedPoints,
    totalPoints,
    score:
      totalPoints === 0 ? 0 : Math.round((earnedPoints / totalPoints) * 100),
  };
}

/** Compara textos sin distinguir mayúsculas, tildes ni espacios repetidos. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isCorrect(
  question: ScorableQuestion,
  answer?: GivenAnswer,
): boolean | null {
  if (question.type === 'ESSAY') {
    // Sin texto no hay nada que revisar: vale 0. Con texto, queda pendiente.
    return answer?.text?.trim() ? null : false;
  }

  if (!answer) {
    return false;
  }

  if (question.type === 'FILL_BLANK') {
    const given = normalizeText(answer.text ?? '');

    return (
      given !== '' &&
      question.options.some((o) => normalizeText(o.text) === given)
    );
  }

  const chosen = new Set(answer.optionIds ?? []);
  const correct = question.options.filter((o) => o.isCorrect).map((o) => o.id);

  // Todo o nada: hay que marcar exactamente las correctas, ni más ni menos.
  return chosen.size === correct.length && correct.every((id) => chosen.has(id));
}

/**
 * Califica un intento. `answers` mapea id de pregunta → respuesta.
 * Una pregunta sin responder vale 0 puntos.
 */
export function scoreAttempt(
  questions: ScorableQuestion[],
  answers: Map<number, GivenAnswer>,
): ScoreResult {
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

  const results = questions.map((q) => ({
    questionId: q.id,
    correct: isCorrect(q, answers.get(q.id)),
  }));

  const earnedPoints = questions.reduce(
    (sum, q, i) => (results[i].correct === true ? sum + q.points : sum),
    0,
  );

  return {
    earnedPoints,
    totalPoints,
    score:
      totalPoints === 0 ? 0 : Math.round((earnedPoints / totalPoints) * 100),
    results,
    pendingReview: results.some((r) => r.correct === null),
  };
}
