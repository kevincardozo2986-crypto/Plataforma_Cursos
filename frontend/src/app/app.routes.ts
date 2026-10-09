import { Routes } from '@angular/router';

import { roleGuard } from './core/auth/role.guard';
import { publicHomeGuard } from './core/auth/public-home.guard';

export const routes: Routes = [
  {
    // Todas las páginas comparten el mismo encabezado (MainLayout).
    path: '',
    loadComponent: () =>
      import('./shared/layout/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [publicHomeGuard],
        loadComponent: () => import('./features/home/pages/home-page').then((m) => m.HomePage),
      },

      {
        path: 'courses',
        loadComponent: () =>
          import('./features/home/pages/catalog-page').then((m) => m.CatalogPage),
      },

      {
        path: 'courses/:id',
        loadComponent: () =>
          import('./features/home/pages/course-detail-page').then((m) => m.CourseDetailPage),
      },
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/pages/login/login-page').then((m) => m.LoginPage),
      },

      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/pages/register/register-page').then((m) => m.RegisterPage),
      },

      {
        // Pública: el código del certificado se comprueba sin iniciar sesión.
        path: 'verificar',
        title: 'Verificar certificado',
        loadComponent: () => import('./features/verify/verify-page').then((m) => m.VerifyPage),
      },

      {
        path: 'verificar/:code',
        title: 'Verificar certificado',
        loadComponent: () => import('./features/verify/verify-page').then((m) => m.VerifyPage),
      },

      {
        path: 'teacher',
        canActivate: [roleGuard('TEACHER', 'ADMIN')],
        loadChildren: () =>
          import('./features/teacher/teacher.routes').then((m) => m.TEACHER_ROUTES),
      },

      {
        path: 'admin',
        canActivate: [roleGuard('ADMIN')],
        loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },
    ],
  },

  {
    path: '**',
    redirectTo: '',
  },
];
