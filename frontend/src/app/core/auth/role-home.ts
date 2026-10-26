import { UserRole } from './auth.models';

/** Página a la que va cada rol después de iniciar sesión. */
export function homeFor(role?: UserRole): string[] {
  if (role === 'STUDENT') return ['/student/dashboard'];
  if (role === 'ADMIN') return ['/admin/overview'];
  return role === 'TEACHER' ? ['/teacher/dashboard'] : ['/'];
}
