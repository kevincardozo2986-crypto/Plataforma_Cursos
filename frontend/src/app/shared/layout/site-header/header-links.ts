import { UserRole } from '../../../core/auth/auth.models';

export interface HeaderLink {
  label: string;
  /** Ruta de destino. Si falta, la página aún no existe. */
  route?: string;
  fragment?: string;
  /** Página todavía no implementada: se muestra deshabilitada. */
  soon?: boolean;
  /** Se marca activo también en sus subrutas (p. ej. /teacher/courses/new). */
  prefix?: boolean;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: 'Estudiante',
  TEACHER: 'Profesor',
  ADMIN: 'Administrador',
};

const common: HeaderLink[] = [
  { label: 'Inicio', route: '/' },
  { label: 'Cursos', route: '/', fragment: 'courses' },
];

/**
 * Menú central del encabezado. Para activar una página nueva basta con
 * quitar `soon` y poner su `route`.
 */
export function headerLinksFor(role: UserRole | null): HeaderLink[] {
  switch (role) {
    case 'STUDENT':
      return [...common, { label: 'Mis cursos', soon: true }];
    case 'TEACHER':
      return [
        ...common,
        { label: 'Panel', route: '/teacher/dashboard', prefix: true },
        { label: 'Mis cursos', route: '/teacher/courses', prefix: true },
      ];
    case 'ADMIN':
      return [
        ...common,
        { label: 'Gestionar cursos', route: '/teacher/courses', prefix: true },
        { label: 'Usuarios', soon: true },
      ];
    default:
      return common;
  }
}
