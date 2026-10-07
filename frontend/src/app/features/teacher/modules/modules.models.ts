import { Lesson } from '../lessons/lessons.models';

export interface CourseModule {
  id: number;
  title: string;
  description: string | null;
  position: number;
  courseId: number;
  lessons: Lesson[];
}

/** Cuerpo de POST/PATCH de módulos. `null` borra la descripción. */
export interface ModuleInput {
  title?: string;
  description?: string | null;
  position?: number;
}
