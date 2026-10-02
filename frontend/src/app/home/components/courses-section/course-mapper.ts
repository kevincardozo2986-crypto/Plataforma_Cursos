import { Course as ApiCourse } from '../../../core/courses/courses.models';
import { Course as CardCourse } from '../course-card/course-card';

const LEVELS: Record<string, string> = {
  BEGINNER: 'Básico',
  INTERMEDIATE: 'Intermedio',
  ADVANCED: 'Avanzado',
};

export const FALLBACK_IMAGE = '/images/prueba1.png';

/** Del curso que devuelve la API al formato de la tarjeta del home. */
export function toCardCourse(course: ApiCourse): CardCourse {
  const modules = course._count?.modules ?? 0;
  const price = Number(course.price);

  return {
    id: String(course.id),
    title: course.title ?? course.name ?? 'Curso',
    category: course.category?.name ?? 'General',
    description: course.description ?? '',
    image: course.imageUrl || course.image || course.thumbnail || FALLBACK_IMAGE,
    duration: modules === 0 ? 'Próximamente' : modules === 1 ? '1 módulo' : `${modules} módulos`,
    level: LEVELS[course.level ?? ''] ?? 'Todos los niveles',
    price: Number.isFinite(price) ? price : 0,
  };
}
