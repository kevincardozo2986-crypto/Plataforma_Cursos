import { Resource } from '../resources/resources.models';

export interface Lesson {
  id: number;
  title: string;
  content: string | null;
  videoUrl: string | null;
  durationMinutes: number | null;
  position: number;
  moduleId: number;
}

export interface LessonWithResources extends Lesson {
  resources: Resource[];
}

/** Cuerpo de POST/PATCH de lecciones. `null` borra un valor opcional. */
export interface LessonInput {
  title?: string;
  content?: string | null;
  videoUrl?: string | null;
  durationMinutes?: number | null;
  position?: number;
}
