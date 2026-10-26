import { Lesson } from '../lessons/lessons.models';

/** Cómo se abre el contenido del curso a los estudiantes. */
export type DripType = 'NONE' | 'BY_DATE' | 'AFTER_DAYS' | 'SEQUENTIAL' | 'PREREQUISITES';

export const DRIP_TYPES: DripType[] = [
  'NONE',
  'SEQUENTIAL',
  'BY_DATE',
  'AFTER_DAYS',
  'PREREQUISITES',
];

export const DRIP_INFO: Record<DripType, { label: string; hint: string }> = {
  NONE: {
    label: 'Todo abierto',
    hint: 'Los estudiantes ven todos los módulos desde que se inscriben.',
  },
  SEQUENTIAL: {
    label: 'Uno tras otro',
    hint: 'El primer módulo está abierto; cada uno de los demás se abre al terminar el anterior.',
  },
  BY_DATE: { label: 'Por fecha', hint: 'Cada módulo se abre en la fecha y hora que tú elijas.' },
  AFTER_DAYS: {
    label: 'Días después de inscribirse',
    hint: 'Cada módulo se abre cierto número de días después de que el estudiante se inscribe.',
  },
  PREREQUISITES: {
    label: 'Con requisitos',
    hint: 'Un módulo se abre cuando el estudiante termina los módulos que tú indiques.',
  },
};

export interface CourseModule {
  id: number;
  title: string;
  description: string | null;
  position: number;
  courseId: number;
  lessons: Lesson[];
  /** Fecha de apertura (modo «Por fecha»), en ISO. */
  unlockAt?: string | null;
  /** Días tras la inscripción (modo «Días después de inscribirse»). */
  unlockAfterDays?: number | null;
  /** Módulos que hay que terminar antes (modo «Con requisitos»). */
  requiresModuleIds?: number[];
}

/** Cuerpo de POST/PATCH de módulos. `null` borra la descripción. */
export interface ModuleInput {
  title?: string;
  description?: string | null;
  position?: number;
  /** `null` quita el ajuste. */
  unlockAt?: string | null;
  unlockAfterDays?: number | null;
  /** Reemplaza la lista completa. */
  requiresModuleIds?: number[];
}
