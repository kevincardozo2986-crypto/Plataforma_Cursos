import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    // Todas las páginas comparten el mismo encabezado (MainLayout).
    path: '',
    loadComponent: () =>
      import('./shared/layout/main-layout/main-layout')
        .then((m) => m.MainLayout),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./home/pages/home-page')
            .then((m) => m.HomePage),
      },

      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/pages/login/login-page')
            .then((m) => m.LoginPage),
      },

      {
        path: 'register',
        loadComponent: () =>
          import('./features/auth/pages/register/register-page')
            .then((m) => m.RegisterPage),
      },
    ],
  },

  {
    path: '**',
    redirectTo: '',
  },
];
