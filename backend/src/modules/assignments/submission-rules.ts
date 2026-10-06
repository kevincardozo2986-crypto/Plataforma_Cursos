import { BadRequestException } from '@nestjs/common';

export interface Deadline {
  dueAt: Date | null;
  allowLate: boolean;
}

/** ¿La entrega llega después de la fecha límite? Sin fecha límite nunca es tardía. */
export function isLate(dueAt: Date | null, now: Date): boolean {
  return dueAt !== null && now.getTime() > dueAt.getTime();
}

/**
 * Reglas para entregar o reenviar. Una entrega ya calificada queda cerrada, y pasada la
 * fecha límite solo se acepta si la tarea permite entregas tardías.
 * Devuelve si la entrega es tardía.
 */
export function assertCanSubmit(
  deadline: Deadline,
  currentStatus: 'SUBMITTED' | 'GRADED' | undefined,
  now: Date,
): boolean {
  if (currentStatus === 'GRADED') {
    throw new BadRequestException(
      'Esta tarea ya fue calificada; no se puede cambiar la entrega',
    );
  }

  const late = isLate(deadline.dueAt, now);

  if (late && !deadline.allowLate) {
    throw new BadRequestException(
      'La fecha límite ya pasó y esta tarea no acepta entregas tardías',
    );
  }

  return late;
}

/** Una entrega necesita un texto, al menos un archivo, o ambos. */
export function assertHasContent(text: string | undefined, fileCount: number) {
  if (!text?.trim() && fileCount === 0) {
    throw new BadRequestException(
      'Escribe tu respuesta o adjunta al menos un archivo',
    );
  }
}

/** La nota es un entero entre 0 y el puntaje máximo de la tarea. */
export function assertValidScore(score: number, maxScore: number) {
  if (!Number.isInteger(score) || score < 0 || score > maxScore) {
    throw new BadRequestException(
      `La nota debe ser un entero entre 0 y ${maxScore}`,
    );
  }
}
