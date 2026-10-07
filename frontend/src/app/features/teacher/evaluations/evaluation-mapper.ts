import { EvaluationQuestion, QuestionInput } from './evaluations.models';

/** Pregunta tal como la edita el formulario: la opción correcta es un índice. */
export interface QuestionDraft {
  text: string;
  points: number;
  correctIndex: number;
  options: string[];
}

/** Del formulario al cuerpo que espera el backend (una opción correcta por pregunta). */
export function toQuestionInputs(drafts: QuestionDraft[]): QuestionInput[] {
  return drafts.map((draft) => ({
    text: draft.text.trim(),
    points: draft.points,
    options: draft.options.map((text, index) => ({
      text: text.trim(),
      isCorrect: index === draft.correctIndex,
    })),
  }));
}

/** De lo que devuelve el backend al formulario. */
export function toQuestionDrafts(questions: EvaluationQuestion[]): QuestionDraft[] {
  return questions.map((question) => ({
    text: question.text,
    points: question.points,
    correctIndex: Math.max(
      0,
      question.options.findIndex((option) => option.isCorrect),
    ),
    options: question.options.map((option) => option.text),
  }));
}

/** Índice de la opción correcta tras quitar la opción `removed`. */
export function correctIndexAfterRemoving(correctIndex: number, removed: number): number {
  if (removed === correctIndex) {
    return 0;
  }

  return removed < correctIndex ? correctIndex - 1 : correctIndex;
}
