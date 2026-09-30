import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
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

  {
    path: '**',
    redirectTo: '',
  },
];