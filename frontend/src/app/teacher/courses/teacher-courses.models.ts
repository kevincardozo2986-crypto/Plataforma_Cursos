import { CourseStatus } from '../../shared/ui/status-badge/status-badge';
import { CourseModule } from '../modules/modules.models';

export type { CourseStatus };
export type CourseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export const LEVEL_LABELS: Record<CourseLevel, string> = {
  BEGINNER: 'Básico',
  INTERMEDIATE: 'Intermedio',
  ADVANCED: 'Avanzado',
};

export const LEVELS = Object.keys(LEVEL_LABELS) as CourseLevel[];

export interface TeacherCourse {
  id: number;
  title: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  /** Decimal serializado por el backend, p. ej. "49.99". */
  price: string;
  level: CourseLevel;
  status: CourseStatus;
  teacherId: number;
  categoryId: number | null;
  category: { id: number; name: string } | null;
  teacher?: { id: number; firstName: string; lastName: string };
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

/** Cuerpo de POST/PATCH /courses. `null` borra el valor opcional. */
export interface CourseInput {
  title: string;
  description: string;
  imageUrl?: string | null;
  price: number;
  level: CourseLevel;
  categoryId?: number | null;
}
