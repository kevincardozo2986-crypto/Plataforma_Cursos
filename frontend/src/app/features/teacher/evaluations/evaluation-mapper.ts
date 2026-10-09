import { EvaluationQuestion, QuestionInput, QuestionType } from './evaluations.models';

export interface OptionDraft {
  text: string;
  correct: boolean;
}

/**
 * Pregunta tal como la edita el formulario. Guarda lo de todos los tipos a la vez, así
 * cambiar de tipo no borra lo escrito; solo se usa lo que corresponde al tipo elegido.
 */
export interface QuestionDraft {
  type: QuestionType;
  text: string;
  points: number;
  /** Verdadero o falso. */
  isTrue: boolean;
  /** Opción única y varias respuestas. */
  options: OptionDraft[];
  /** Completar la palabra: respuestas aceptadas. */
  answers: string[];
}

const TRUE_TEXT = 'Verdadero';

export function newDraft(type: QuestionType = 'SINGLE'): QuestionDraft {
  return {
    type,
    text: '',
    points: 1,
    isTrue: true,
    options: [
      { text: '', correct: type === 'SINGLE' },
      { text: '', correct: false },
    ],
    answers: [''],
  };
}

/** Del formulario al cuerpo que espera el backend. */
export function toQuestionInputs(drafts: QuestionDraft[]): QuestionInput[] {
  return drafts.map((draft) => {
    const base = { type: draft.type, text: draft.text.trim(), points: draft.points };

    switch (draft.type) {
      case 'TRUE_FALSE':
        return { ...base, isTrue: draft.isTrue };
      case 'FILL_BLANK':
        return {
          ...base,
          acceptedAnswers: draft.answers.map((answer) => answer.trim()).filter(Boolean),
        };
      case 'ESSAY':
        return base;
      default:
        return {
          ...base,
          options: draft.options.map((option) => ({
            text: option.text.trim(),
            isCorrect: option.correct,
          })),
        };
    }
  });
}

/** De lo que devuelve el backend al formulario. */
export function toQuestionDrafts(questions: EvaluationQuestion[]): QuestionDraft[] {
  return questions.map((question) => {
    const draft = newDraft(inferType(question));

    draft.text = question.text;
    draft.points = question.points;

    switch (draft.type) {
      case 'TRUE_FALSE':
        draft.isTrue =
          question.options.find((option) => option.text === TRUE_TEXT)?.isCorrect ?? true;
        break;
      case 'FILL_BLANK':
        draft.answers = question.options.length ? question.options.map((o) => o.text) : [''];
        break;
      case 'ESSAY':
        break;
      default:
        draft.options = question.options.map((option) => ({
          text: option.text,
          correct: option.isCorrect,
        }));
    }

    return draft;
  });
}

/** Un quiz antiguo no trae el tipo: una sola correcta es opción única; varias, varias respuestas. */
function inferType(question: EvaluationQuestion): QuestionType {
  if (question.type) {
    return question.type;
  }

  return question.options.filter((option) => option.isCorrect).length > 1 ? 'MULTIPLE' : 'SINGLE';
}

/**
 * Cambia el tipo de una pregunta ajustando lo necesario: al pasar a opción única solo
 * puede quedar una correcta (la primera marcada, o ninguna si no había).
 */
export function changeType(draft: QuestionDraft, type: QuestionType): QuestionDraft {
  if (type !== 'SINGLE') {
    return { ...draft, type };
  }

  let found = false;

  return {
    ...draft,
    type,
    options: draft.options.map((option) => {
      const correct = option.correct && !found;

      found ||= option.correct;

      return { ...option, correct };
    }),
  };
}

/** Marca una sola opción como correcta (opción única). */
export function markOnlyCorrect(options: OptionDraft[], index: number): OptionDraft[] {
  return options.map((option, position) => ({ ...option, correct: position === index }));
}

/** Mensaje de lo que falta o está mal en una pregunta, o null si está bien. */
export function validateQuestion(draft: QuestionDraft): string | null {
  if (draft.text.trim().length < 3) {
    return 'Escribe el enunciado (mínimo 3 caracteres).';
  }

  if (!Number.isInteger(draft.points) || draft.points < 1 || draft.points > 1000) {
    return 'Los puntos deben ser un entero entre 1 y 1000.';
  }

  switch (draft.type) {
    case 'SINGLE':
    case 'MULTIPLE': {
      if (draft.options.length < 2) {
        return 'Necesita al menos 2 opciones.';
      }

      if (draft.options.some((option) => !option.text.trim())) {
        return 'Escribe el texto de todas las opciones o quita las vacías.';
      }

      const correct = draft.options.filter((option) => option.correct).length;

      if (draft.type === 'SINGLE') {
        return correct === 1 ? null : 'Marca cuál es la respuesta correcta.';
      }

      if (correct < 2) {
        return 'Marca al menos 2 respuestas correctas.';
      }

      return correct === draft.options.length ? 'Debe haber al menos una opción incorrecta.' : null;
    }

    case 'FILL_BLANK':
      return draft.answers.some((answer) => answer.trim())
        ? null
        : 'Escribe al menos una respuesta aceptada.';

    default:
      return null;
  }
}
