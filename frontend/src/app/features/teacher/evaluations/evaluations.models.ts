import { QuestionType } from '../../../core/grading/grading.service';

export type { QuestionType };

/** Los tipos que el docente puede crear, con una pista de cómo se califica cada uno. */
export const QUESTION_TYPES: { value: QuestionType; label: string; hint: string }[] = [
  {
    value: 'SINGLE',
    label: 'Opción única',
    hint: 'El estudiante elige una opción. Se califica sola.',
  },
  {
    value: 'MULTIPLE',
    label: 'Varias respuestas',
    hint: 'Hay varias correctas y se debe marcar exactamente esas. Se califica sola, todo o nada.',
  },
  {
    value: 'TRUE_FALSE',
    label: 'Verdadero o falso',
    hint: 'El estudiante elige entre verdadero y falso. Se califica sola.',
  },
  {
    value: 'FILL_BLANK',
    label: 'Completar la palabra',
    hint: 'El estudiante escribe la respuesta. No distingue mayúsculas, tildes ni espacios de más.',
  },
  {
    value: 'ESSAY',
    label: 'Pregunta abierta',
    hint: 'El estudiante escribe un texto y tú lo calificas a mano en «Intentos del cuestionario».',
  },
];

export interface EvaluationOption {
  id?: number;
  text: string;
  /** Solo el profesor y el administrador reciben este dato. */
  isCorrect: boolean;
}

export interface EvaluationQuestion {
  id?: number;
  /** Los quizzes antiguos pueden no traerlo: se deduce de las opciones. */
  type?: QuestionType;
  text: string;
  points: number;
  position?: number;
  /** En «completar la palabra» son las respuestas aceptadas. */
  options: EvaluationOption[];
}

/** Fila de GET /modules/:id/evaluations. */
export interface EvaluationSummary {
  id: number;
  title: string;
  description: string | null;
  passingScore: number;
  moduleId: number;
  _count: { questions: number };
}

/** GET /evaluations/:id con sus preguntas y opciones. */
export interface Evaluation {
  id: number;
  title: string;
  description: string | null;
  passingScore: number;
  moduleId: number;
  questions: EvaluationQuestion[];
}

/** Una pregunta como la espera el backend; qué campos van depende de `type`. */
export interface QuestionInput {
  type: QuestionType;
  text: string;
  points: number;
  /** Opción única y varias respuestas. */
  options?: { text: string; isCorrect: boolean }[];
  /** Verdadero o falso. */
  isTrue?: boolean;
  /** Completar la palabra. */
  acceptedAnswers?: string[];
}

/** POST/PATCH. Si se envían `questions`, reemplazan todas las preguntas. */
export interface EvaluationInput {
  title?: string;
  description?: string | null;
  passingScore?: number;
  questions?: QuestionInput[];
}
