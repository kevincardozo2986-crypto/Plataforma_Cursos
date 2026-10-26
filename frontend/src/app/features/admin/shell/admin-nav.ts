export interface AdminNavItem {
  label: string;
  /** Ruta relativa a /admin. */
  path: string;
  icon: string[];
  description: string;
}

/** Menú lateral del panel del administrador. */
export const ADMIN_NAV: AdminNavItem[] = [
  {
    label: 'Resumen',
    path: 'overview',
    icon: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
    description: 'Las cifras de toda la plataforma.',
  },
  {
    label: 'Usuarios',
    path: 'users',
    icon: [
      'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
      'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
      'M22 21v-2a4 4 0 0 0-3-3.87',
      'M16 3.13a4 4 0 0 1 0 7.75',
    ],
    description: 'Cuentas, roles y acceso.',
  },
  {
    label: 'Cursos',
    path: 'courses',
    icon: [
      'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z',
      'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
    ],
    description: 'Todos los cursos y su estado.',
  },
  {
    label: 'Categorías',
    path: 'categories',
    icon: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
    description: 'Cómo se agrupan los cursos en el catálogo.',
  },
];
