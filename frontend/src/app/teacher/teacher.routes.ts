import { Routes } from '@angular/router';

/** Rutas de /teacher. El acceso (profesor o admin) lo controla roleGuard en app.routes.ts. */
export const TEACHER_ROUTES: Routes = [
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
    loadComponent: () =>
      import('./courses/course-list/course-list').then((m) => m.CourseList),
  },

  {
    path: 'courses/new',
    title: 'Nuevo curso',
    loadComponent: () =>
      import('./courses/course-form/course-form').then((m) => m.CourseForm),
  },

  {
    path: 'courses/:id/edit',
    title: 'Editar curso',
    loadComponent: () =>
      import('./courses/course-form/course-form').then((m) => m.CourseForm),
  },

  {
    path: 'courses/:id/content',
    title: 'Contenido del curso',
    loadComponent: () =>
      import('./courses/course-content/course-content').then((m) => m.CourseContent),
  },

  {
    path: 'courses/:id/modules/:moduleId/lessons/new',
    title: 'Nueva lección',
    loadComponent: () =>
      import('./lessons/lesson-form/lesson-form').then((m) => m.LessonForm),
  },

  {
    path: 'courses/:id/lessons/:lessonId/edit',
    title: 'Editar lección',
    loadComponent: () =>
      import('./lessons/lesson-form/lesson-form').then((m) => m.LessonForm),
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
];
