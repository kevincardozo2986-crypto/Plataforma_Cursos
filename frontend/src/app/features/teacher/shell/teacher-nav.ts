export interface NavChild {
  label: string;
  /** Ruta relativa a /teacher. */
  path: string;
  description: string;
}

export interface NavItem {
  label: string;
  /** Ruta relativa a /teacher, p. ej. "courses". */
  path: string;
  /** Trazos SVG (viewBox 24×24) del ícono. */
  icon: string[];
  /** false = la pantalla aún no existe: abre una página "próximamente". */
  ready: boolean;
  description: string;
  children?: NavChild[];
}

/**
 * Menú lateral del panel del docente. Es la única fuente: de aquí salen los
 * enlaces del menú y las rutas provisionales de teacher.routes.ts.
 */
export const TEACHER_NAV: NavItem[] = [
  {
    label: 'Inicio',
    path: 'dashboard',
    ready: true,
    description: 'Tablero con el resumen de tus cursos.',
    icon: ['M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z'],
  },
  {
    label: 'Cursos',
    path: 'courses',
    ready: true,
    description: 'Gestión de tus cursos.',
    icon: ['M4 4h16v13H6.5A2.5 2.5 0 0 0 4 19.5z', 'M4 19.5A2.5 2.5 0 0 0 6.5 22H20'],
  },
  {
    label: 'Anuncios',
    path: 'announcements',
    ready: false,
    description:
      'Comunicados del docente a los estudiantes inscritos en un curso, con filtro por curso.',
    icon: [
      'M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z',
      'M15 9a4 4 0 0 1 0 6',
      'M18 6a8 8 0 0 1 0 12',
    ],
  },
  {
    label: 'Intentos del cuestionario',
    path: 'quiz-attempts',
    ready: false,
    description:
      'Bandeja de evaluaciones presentadas por los estudiantes, filtrable por curso y estado, para revisar sus respuestas.',
    icon: [
      'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2',
      'M9 3h6v4H9z',
      'M9 14l2 2 4-4',
    ],
  },
  {
    label: 'Discusiones',
    path: 'discussions',
    ready: false,
    description:
      'Preguntas y respuestas de los estudiantes en cada curso y comentarios dejados en las lecciones.',
    icon: ['M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  },
  {
    label: 'Tareas',
    path: 'assignments',
    ready: false,
    description: 'Entregas de tareas de los estudiantes para revisarlas y calificarlas.',
    icon: [
      'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
      'M14 3v5h5',
      'M9 13h6',
      'M9 17h6',
    ],
  },
  {
    label: 'Zoom',
    path: 'zoom',
    ready: false,
    description: 'Crea clases en vivo desde la plataforma con tu cuenta de Zoom.',
    icon: [
      'M3 7h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z',
      'M17 10l5-3v10l-5-3',
    ],
    children: [
      {
        label: 'Configurar API',
        path: 'zoom/api',
        description:
          'Registra el Account ID, el Client ID y el Client Secret de tu cuenta de Zoom.',
      },
      {
        label: 'Ajustes',
        path: 'zoom/settings',
        description: 'Preferencias de tus clases en vivo.',
      },
      {
        label: 'Ayuda',
        path: 'zoom/help',
        description: 'Cómo conectar tu cuenta de Zoom y programar clases.',
      },
    ],
  },
  {
    label: 'Certificados',
    path: 'certificates',
    ready: false,
    description:
      'Constructor de certificados personalizados y asignación de cada certificado a un curso.',
    icon: ['M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12z', 'M8.5 14L7 22l5-3 5 3-1.5-8'],
  },
  {
    label: 'Analíticas',
    path: 'analytics',
    ready: false,
    description:
      'Reportes de tus cursos, estudiantes y reseñas, con gráficas por día, mes o año y opción de exportar.',
    icon: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  },
];

/** Rutas relativas a /teacher de las pantallas que todavía no existen. */
export function pendingPages(): { path: string; title: string; description: string }[] {
  return TEACHER_NAV.filter((item) => !item.ready).flatMap((item) =>
    item.children
      ? item.children.map((child) => ({
          path: child.path,
          title: `${item.label}: ${child.label}`,
          description: child.description,
        }))
      : [{ path: item.path, title: item.label, description: item.description }],
  );
}
