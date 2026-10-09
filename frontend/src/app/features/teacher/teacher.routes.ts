import { Routes } from '@angular/router';

import { pendingPages, TEACHER_NAV } from './shell/teacher-nav';

const comingSoon = () =>
  import('../../shared/ui/coming-soon/coming-soon').then((m) => m.ComingSoon);

/** Secciones del menú lateral cuya pantalla aún no existe: abren una página "próximamente". */
const pendingRoutes: Routes = [
  ...pendingPages().map((page) => ({
    path: page.path,
    title: page.title,
    data: {
      title: page.title,
      description: page.description,
      backTo: '/teacher/dashboard',
      backLabel: 'Ir al inicio del panel',
    },
    loadComponent: comingSoon,
  })),

  // Un grupo con submenús (Zoom) abre su primer submenú.
  ...TEACHER_NAV.filter((item) => !item.ready && item.children?.length).map((item) => ({
    path: item.path,
    pathMatch: 'full' as const,
    redirectTo: item.children?.[0].path ?? item.path,
  })),
];

/**
 * Rutas de /teacher. El acceso (profesor o admin) lo controla roleGuard en app.routes.ts.
 * Todas cuelgan de TeacherShell, que pone el menú lateral.
 */
export const TEACHER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./shell/teacher-shell').then((m) => m.TeacherShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

      {
        path: 'dashboard',
        title: 'Panel del profesor',
        loadComponent: () =>
          import('./dashboard/teacher-dashboard').then((m) => m.TeacherDashboard),
      },

      {
        path: 'courses',
        title: 'Mis cursos',
        loadComponent: () => import('./courses/course-list/course-list').then((m) => m.CourseList),
      },

      {
        // Al abrirse crea un borrador y pasa al paso 1 del asistente.
        path: 'courses/new',
        title: 'Nuevo curso',
        loadComponent: () =>
          import('./courses/course-wizard/course-draft-entry').then((m) => m.CourseDraftEntry),
      },

      {
        // Asistente de tres pasos: Básicos → Currículo → Adicional.
        path: 'courses/:id/edit',
        loadComponent: () =>
          import('./courses/course-wizard/course-wizard').then((m) => m.CourseWizard),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'basics' },
          {
            path: 'basics',
            title: 'Curso: básicos',
            loadComponent: () =>
              import('./courses/course-wizard/steps/basics-step').then((m) => m.BasicsStep),
          },
          {
            path: 'curriculum',
            title: 'Curso: currículo',
            loadComponent: () =>
              import('./courses/course-wizard/steps/curriculum-step').then((m) => m.CurriculumStep),
          },
          {
            path: 'additional',
            title: 'Curso: adicional',
            loadComponent: () =>
              import('./courses/course-wizard/steps/additional-step').then((m) => m.AdditionalStep),
          },
        ],
      },

      // La pantalla de contenido ahora es el paso 2 del asistente.
      {
        path: 'courses/:id/content',
        pathMatch: 'full',
        redirectTo: ({ params }) => `/teacher/courses/${params['id']}/edit/curriculum`,
      },

      {
        path: 'courses/:id/modules/:moduleId/lessons/new',
        title: 'Nueva lección',
        loadComponent: () => import('./lessons/lesson-form/lesson-form').then((m) => m.LessonForm),
      },

      {
        path: 'courses/:id/lessons/:lessonId/edit',
        title: 'Editar lección',
        loadComponent: () => import('./lessons/lesson-form/lesson-form').then((m) => m.LessonForm),
      },

      {
        path: 'courses/:id/modules/:moduleId/evaluations/new',
        title: 'Nueva evaluación',
        loadComponent: () =>
          import('./evaluations/evaluation-form/evaluation-form').then((m) => m.EvaluationForm),
      },

      {
        path: 'courses/:id/evaluations/:evaluationId/edit',
        title: 'Editar evaluación',
        loadComponent: () =>
          import('./evaluations/evaluation-form/evaluation-form').then((m) => m.EvaluationForm),
      },

      {
        path: 'courses/:id/modules/:moduleId/assignments/new',
        title: 'Nueva tarea',
        loadComponent: () => import('./assignments/assignment-form').then((m) => m.AssignmentForm),
      },

      {
        path: 'courses/:id/assignments/:assignmentId/edit',
        title: 'Editar tarea',
        loadComponent: () => import('./assignments/assignment-form').then((m) => m.AssignmentForm),
      },

      {
        path: 'quiz-attempts',
        title: 'Intentos del cuestionario',
        loadComponent: () => import('./grading/attempts-page').then((m) => m.AttemptsPage),
      },

      {
        path: 'quiz-attempts/:id',
        title: 'Calificar intento',
        loadComponent: () => import('./grading/attempt-detail').then((m) => m.AttemptDetailPage),
      },

      {
        path: 'assignments',
        title: 'Tareas',
        loadComponent: () => import('./grading/submissions-page').then((m) => m.SubmissionsPage),
      },

      {
        path: 'assignments/:id',
        title: 'Calificar entrega',
        loadComponent: () =>
          import('./grading/submission-detail').then((m) => m.SubmissionDetailPage),
      },

      {
        path: 'announcements',
        title: 'Anuncios',
        loadComponent: () =>
          import('./announcements/announcements-page').then((m) => m.AnnouncementsPage),
      },

      {
        path: 'discussions',
        title: 'Discusiones',
        loadComponent: () =>
          import('./discussions/discussions-page').then((m) => m.DiscussionsPage),
      },

      {
        path: 'discussions/:id',
        title: 'Discusión',
        loadComponent: () =>
          import('./discussions/discussion-thread').then((m) => m.DiscussionThreadPage),
      },

      {
        path: 'profile',
        title: 'Mi perfil',
        loadComponent: () => import('./profile/profile-page').then((m) => m.ProfilePage),
      },

      {
        path: 'certificates',
        title: 'Certificados',
        loadComponent: () =>
          import('./certificates/certificates-page').then((m) => m.CertificatesPage),
      },

      {
        path: 'certificates/new',
        title: 'Nueva plantilla de certificado',
        loadComponent: () => import('./certificates/template-editor').then((m) => m.TemplateEditor),
      },

      {
        path: 'certificates/:id',
        title: 'Editar plantilla de certificado',
        loadComponent: () => import('./certificates/template-editor').then((m) => m.TemplateEditor),
      },

      ...pendingRoutes,
    ],
  },
];
