import { BadRequestException } from '@nestjs/common';

import {
  type GivenAnswer,
  type GradedItem,
  type QuestionKind,
  type QuestionResult,
  type ScorableQuestion,
  scoreOfItems,
} from './scoring.js';

/**
 * Foto de una pregunta dentro de un intento. Se guarda al presentar el quiz para que la
 * revisión del docente no dependa de que luego edite o borre las preguntas.
 * Contiene la respuesta correcta: solo se muestra al docente, nunca al estudiante.
 */
export interface AttemptItem extends GradedItem {
  text: string;
  type: QuestionKind;
  /** `null` mientras una pregunta abierta espera calificación. */
  correct: boolean | null;
  /** Textos de las opciones que marcó el estudiante (preguntas de opciones). */
  chosen?: string[];
  /** Lo que escribió el estudiante (completar palabra y abiertas). */
  written?: string;
  /** Respuestas correctas (todo menos las abiertas). */
  expected?: string[];
  /** Una pregunta abierta ya calificada por el docente. */
  graded?: boolean;
  comment?: string;
}

export interface QuestionGrade {
  questionId: number;
  points: number;
  comment?: string;
}

export type SnapshotQuestion = ScorableQuestion & { text: string };

/** Arma la foto de cada pregunta con lo que respondió el estudiante y cómo salió. */
export function buildSnapshot(
  questions: SnapshotQuestion[],
  given: Map<number, GivenAnswer>,
  results: QuestionResult[],
): AttemptItem[] {
  return questions.map((question, index) => {
    const { correct } = results[index];
    const answer = given.get(question.id);
    const optionTexts = (ids: number[]) =>
      question.options.filter((o) => ids.includes(o.id)).map((o) => o.text);

    const item: AttemptItem = {
      questionId: question.id,
      text: question.text,
      type: question.type,
      points: question.points,
      correct,
      earned: correct === null ? null : correct ? question.points : 0,
    };

    if (question.type === 'FILL_BLANK' || question.type === 'ESSAY') {
      item.written = answer?.text ?? '';
    } else {
      item.chosen = optionTexts(answer?.optionIds ?? []);
    }

    if (question.type !== 'ESSAY') {
      item.expected = question.options
        .filter((o) => o.isCorrect)
        .map((o) => o.text);
    }

    return item;
  });
}

/** Preguntas abiertas con respuesta que el docente aún no calificó. */
export function pendingEssays(items: AttemptItem[]): AttemptItem[] {
  return items.filter(
    (i) => i.type === 'ESSAY' && i.written?.trim() && !i.graded,
  );
}

/**
 * Aplica las notas del docente a las preguntas abiertas. No modifica el original.
 * Solo se pueden calificar preguntas abiertas con respuesta, con puntos enteros
 * entre 0 y el máximo de la pregunta. También sirve para corregir una nota ya puesta.
 */
export function applyGrades(
  items: AttemptItem[],
  grades: QuestionGrade[],
): AttemptItem[] {
  const seen = new Set<number>();

  for (const grade of grades) {
    if (seen.has(grade.questionId)) {
      throw new BadRequestException(
        `La pregunta ${grade.questionId} está calificada más de una vez`,
      );
    }

    seen.add(grade.questionId);
  }

  const gradable = new Map(
    items
      .filter((i) => i.type === 'ESSAY' && i.written?.trim())
      .map((i) => [i.questionId, i]),
  );

  for (const grade of grades) {
    const item = gradable.get(grade.questionId);

    if (!item) {
      throw new BadRequestException(
        `La pregunta ${grade.questionId} no es una pregunta abierta respondida de este intento`,
      );
    }

    if (!Number.isInteger(grade.points) || grade.points < 0 || grade.points > item.points) {
      throw new BadRequestException(
        `Los puntos de la pregunta ${grade.questionId} deben ser un entero entre 0 y ${item.points}`,
      );
    }
  }

  const byQuestion = new Map(grades.map((g) => [g.questionId, g]));

  return items.map((item) => {
    const grade = byQuestion.get(item.questionId);

    return grade
      ? {
          ...item,
          earned: grade.points,
          correct: grade.points === item.points,
          graded: true,
          comment: grade.comment || undefined,
        }
      : item;
  });
}

/** Nota, aprobado y estado del intento según lo calificado hasta ahora. */
export function summarize(items: AttemptItem[], passingScore: number) {
  const pending = pendingEssays(items).length > 0;
  const { score, earnedPoints, totalPoints } = scoreOfItems(items);

  return {
    score,
    earnedPoints,
    totalPoints,
    pending,
    // Mientras haya preguntas por calificar, la nota es provisional y no aprueba.
    passed: !pending && score >= passingScore,
  };
}
