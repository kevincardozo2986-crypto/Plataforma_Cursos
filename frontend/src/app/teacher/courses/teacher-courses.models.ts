import { CourseStatus } from '../../shared/ui/status-badge/status-badge';
import { CourseModule } from '../modules/modules.models';

export type { CourseStatus };
export type CourseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type CourseVisibility = 'PUBLIC' | 'PRIVATE' | 'PASSWORD';

export const LEVEL_LABELS: Record<CourseLevel, string> = {
  BEGINNER: 'Básico',
  INTERMEDIATE: 'Intermedio',
  ADVANCED: 'Avanzado',
};

export const LEVELS = Object.keys(LEVEL_LABELS) as CourseLevel[];

export const VISIBILITY_LABELS: Record<CourseVisibility, { label: string; hint: string }> = {
  PUBLIC: { label: 'Público', hint: 'Aparece en el catálogo y cualquiera puede inscribirse.' },
  PASSWORD: { label: 'Con contraseña', hint: 'Aparece en el catálogo, pero hay que escribir la contraseña para inscribirse.' },
  PRIVATE: { label: 'Privado', hint: 'No aparece en el catálogo ni admite inscripciones.' },
};

export const VISIBILITIES = Object.keys(VISIBILITY_LABELS) as CourseVisibility[];

/** Título con el que nace un borrador; el backend lo trata como "sin título". */
export const DRAFT_TITLE = 'Curso sin título';

export interface TeacherCourse {
  id: number;
  title: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  introVideoUrl: string | null;
  /** Decimal serializado por el backend, p. ej. "49.99". */
  price: string;
  level: CourseLevel;
  status: CourseStatus;
  teacherId: number;
  categoryId: number | null;
  category: { id: number; name: string } | null;
  teacher?: { id: number; firstName: string; lastName: string };

  // Acceso y cupo
  visibility: CourseVisibility;
  /** El backend nunca envía la contraseña, solo si existe una. */
  hasPassword?: boolean;
  maxStudents: number | null;
  publicContent: boolean;
  qaEnabled: boolean;

  // Resumen del curso
  whatYouWillLearn: string | null;
  audience: string | null;
  durationMinutes: number | null;
  materials: string | null;
  requirements: string | null;

  /** Solo en GET /courses/manage/:id. */
  prerequisites?: { id: number; title: string }[];

  createdAt: string;
  updatedAt: string;
}

/** Curso con su árbol de contenido (GET /courses/manage/:id). */
export interface CourseWithContent extends TeacherCourse {
  modules: CourseModule[];
}

export interface CategoryOption {
  id: number;
  name: string;
}

/** Cuerpo de POST /courses (alta rápida). `null` borra el valor opcional. */
export interface CourseInput {
  title: string;
  description: string;
  imageUrl?: string | null;
  price: number;
  level: CourseLevel;
  categoryId?: number | null;
}

/** Cuerpo de PATCH /courses/:id: todo es opcional y `null` borra los campos opcionales. */
export interface CourseUpdate {
  title?: string;
  slug?: string;
  description?: string;
  imageUrl?: string | null;
  introVideoUrl?: string | null;
  price?: number;
  level?: CourseLevel;
  categoryId?: number | null;
  visibility?: CourseVisibility;
  accessPassword?: string;
  maxStudents?: number | null;
  publicContent?: boolean;
  qaEnabled?: boolean;
  whatYouWillLearn?: string | null;
  audience?: string | null;
  durationMinutes?: number | null;
  materials?: string | null;
  requirements?: string | null;
  /** Reemplaza la lista completa de prerrequisitos. */
  prerequisiteIds?: number[];
}
