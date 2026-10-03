import { Routes } from '@angular/router';

const comingSoon = () =>
  import('../shared/ui/coming-soon/coming-soon').then((m) => m.ComingSoon);

/** Rutas de /admin (solo ADMIN, ver roleGuard en app.routes.ts). Las pantallas llegan en la siguiente ronda. */
export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'users' },
  { path: 'users', title: 'Usuarios', data: { title: 'Usuarios' }, loadComponent: comingSoon },
  { path: 'courses', title: 'Cursos', data: { title: 'Cursos' }, loadComponent: comingSoon },
  { path: 'categories', title: 'Categorías', data: { title: 'Categorías' }, loadComponent: comingSoon },
];
