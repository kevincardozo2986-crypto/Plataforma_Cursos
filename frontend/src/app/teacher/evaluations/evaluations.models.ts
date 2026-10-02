export interface EvaluationOption {
  id?: number;
  text: string;
  /** Solo el profesor y el administrador reciben este dato. */
  isCorrect: boolean;
}

export interface EvaluationQuestion {
  id?: number;
  text: string;
  points: number;
  position?: number;
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

export interface QuestionInput {
  text: string;
  points: number;
  options: { text: string; isCorrect: boolean }[];
}

/** POST/PATCH. Si se envían `questions`, reemplazan todas las preguntas. */
export interface EvaluationInput {
  title?: string;
  description?: string | null;
  passingScore?: number;
  questions?: QuestionInput[];
}
