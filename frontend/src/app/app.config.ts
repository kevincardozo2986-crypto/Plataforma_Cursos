import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';

import {
  provideRouter,
} from '@angular/router';

import {
  provideClientHydration,
} from '@angular/platform-browser';

import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';

import {
  firstValueFrom,
} from 'rxjs';

import {
  authInterceptor,
} from './core/auth/auth.interceptor';

import {
  AuthService,
} from './core/auth/auth.service';

import {
  routes,
} from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(
      withFetch(),
      withInterceptors([
        authInterceptor,
      ]),
    ),

    provideBrowserGlobalErrorListeners(),

    provideRouter(routes),

    provideClientHydration(),

    provideAppInitializer(() => {
      const auth = inject(AuthService);

      return firstValueFrom(
        auth.restoreSession(),
      );
    }),
  ],
};