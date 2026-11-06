import { DRAFT_TITLE, LEVEL_LABELS, TeacherCourse } from '../teacher-courses.models';

export type CoverColor = 'blue' | 'teal' | 'sand' | 'green';
export type CourseSort = 'rec' | 'az' | 'stu';

const COVER_COLORS: CoverColor[] = ['blue', 'teal', 'sand', 'green'];

/** Los 5 pasos que dejan un borrador listo para publicar. */
export const SETUP_STEPS = ['Título', 'Categoría', 'Portada', 'Primera lección', 'Precio'] as const;

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Color de portada estable por curso (el mismo id siempre da el mismo color). */
export function coverColorOf(id: number): CoverColor {
  return COVER_COLORS[(id * 7 + 3) % COVER_COLORS.length];
}

export function isUntitled(course: Pick<TeacherCourse, 'title'>): boolean {
  const title = course.title.trim();

  return title === '' || title === DRAFT_TITLE;
}

/** Iniciales para la portada sin foto: «Bases de datos I» → BD; sin título → Aa. */
export function monogram(title: string): string {
  const clean = title.trim();

  if (clean === '' || clean === DRAFT_TITLE) return 'Aa';

  const words = clean.split(/\s+/).filter((word) => word.length > 1);

  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();

  return (words[0] ?? clean).slice(0, 2).toUpperCase();
}

export interface SetupStep {
  label: (typeof SETUP_STEPS)[number];
  ok: boolean;
}

/** Qué le falta a un borrador: título, categoría, portada, primera lección y precio. */
export function setupSteps(course: TeacherCourse): SetupStep[] {
  const done = [
    !isUntitled(course),
    course.categoryId !== null,
    !!course.imageUrl,
    (course.library?.lessons ?? 0) > 0,
    Number(course.price) > 0,
  ];

  return SETUP_STEPS.map((label, index) => ({ label, ok: done[index] }));
}

export function setupDone(course: TeacherCourse): number {
  return setupSteps(course).filter((step) => step.ok).length;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Días de calendario entre dos fechas (0 = mismo día, 1 = ayer…). */
export function calendarDays(from: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(from)) / 86_400_000);
}

/** «Editado hoy», «Ayer», «Hace 4 días» o «26 de oct». */
export function relativeDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const days = calendarDays(date, now);

  if (days <= 0) return 'Editado hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;

  const base = `${date.getDate()} de ${MONTHS[date.getMonth()]}`;

  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** Para el encabezado de «Continúa donde quedaste»: «editado hoy», «ayer»… */
export function relativeLower(iso: string, now = new Date()): string {
  const label = relativeDate(iso, now);

  return label.charAt(0).toLowerCase() + label.slice(1);
}

export function priceLabel(price: string): string {
  const value = Number(price);

  return value === 0 ? 'Gratis' : `$ ${value.toLocaleString('es-CO')}`;
}

export function levelLabel(course: Pick<TeacherCourse, 'level'>): string {
  return LEVEL_LABELS[course.level];
}

export function matchesQuery(course: TeacherCourse, query: string): boolean {
  const term = query.trim().toLowerCase();

  if (!term) return true;

  return (
    course.title.toLowerCase().includes(term) ||
    (course.category?.name.toLowerCase().includes(term) ?? false)
  );
}

/** Ordena una copia: recientes primero, A–Z (sin título al final) o con más estudiantes. */
export function sortCourses(courses: TeacherCourse[], sort: CourseSort): TeacherCourse[] {
  const copy = [...courses];

  if (sort === 'az') {
    return copy.sort((a, b) => {
      if (isUntitled(a) !== isUntitled(b)) return isUntitled(a) ? 1 : -1;

      return a.title.localeCompare(b.title, 'es');
    });
  }

  if (sort === 'stu') {
    return copy.sort((a, b) => (b.library?.enrolled ?? 0) - (a.library?.enrolled ?? 0));
  }

  return copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
