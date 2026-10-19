import { UserRole } from '../auth/auth.models';
import { AppNotification } from './notifications.service';

/**
 * A dónde lleva una notificación. El backend no manda enlaces: con el tipo, el curso y el
 * `refId` se arma la ruta. Devuelve null si ese aviso no tiene una pantalla a donde ir
 * (el aviso igual se marca como leído al tocarlo).
 */
export function notificationLink(
  notification: Pick<AppNotification, 'type' | 'courseId' | 'refId'>,
  role: UserRole | null | undefined,
): string[] | null {
  const { type, courseId, refId } = notification;
  const staff = role === 'TEACHER' || role === 'ADMIN';
  const course = courseId ? ['/courses', String(courseId)] : null;

  if (staff) {
    switch (type) {
      case 'NEW_QUESTION':
      case 'NEW_REPLY':
        // `refId` es la pregunta o el comentario (el hilo).
        return refId ? ['/teacher/discussions', String(refId)] : ['/teacher/discussions'];
      case 'NEW_REVIEW':
        return ['/teacher/reviews'];
      case 'ANNOUNCEMENT':
        return ['/teacher/announcements'];
      case 'INSTRUCTOR_ADDED':
        return courseId ? ['/teacher', 'courses', String(courseId), 'edit'] : ['/teacher/courses'];
      default:
        return course;
    }
  }

  // Estudiantes: aún no hay pantallas propias, así que se lleva a la página del curso.
  return course;
}

/** «hace un momento», «hace 5 min», «hace 3 h», «ayer», «hace 4 días», o la fecha si ya pasó un mes. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();

  if (Number.isNaN(then)) {
    return '';
  }

  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 45) {
    return 'hace un momento';
  }
  if (minutes < 60) {
    return `hace ${Math.max(1, minutes)} min`;
  }
  if (hours < 24) {
    return `hace ${hours} h`;
  }
  if (days === 1) {
    return 'ayer';
  }
  if (days < 30) {
    return `hace ${days} días`;
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(then));
}
