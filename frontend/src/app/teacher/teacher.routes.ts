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
];
