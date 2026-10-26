import { Routes } from '@angular/router';

/** Rutas de /admin (solo ADMIN, ver roleGuard en app.routes.ts). Cuelgan de AdminShell, que pone el menú lateral. */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./shell/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        title: 'Resumen',
        loadComponent: () => import('./overview/overview-page').then((m) => m.OverviewPage),
      },
      {
        path: 'users',
        title: 'Usuarios',
        loadComponent: () => import('./users/users-page').then((m) => m.UsersPage),
      },
      {
        path: 'courses',
        title: 'Cursos',
        loadComponent: () => import('./courses/courses-page').then((m) => m.CoursesPage),
      },
      {
        path: 'categories',
        title: 'Categorías',
        loadComponent: () => import('./categories/categories-page').then((m) => m.CategoriesPage),
      },
    ],
  },
];
