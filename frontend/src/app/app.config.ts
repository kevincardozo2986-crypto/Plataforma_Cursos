import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import {
  ApplicationConfig,
  inject,
  LOCALE_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';

import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { provideClientHydration } from '@angular/platform-browser';

import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';

import { firstValueFrom } from 'rxjs';

import { authInterceptor } from './core/auth/auth.interceptor';

import { AuthService } from './core/auth/auth.service';

import { routes } from './app.routes';

// Las fechas y los números se muestran en español («22 de octubre»).
registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'es' },

    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),

    provideBrowserGlobalErrorListeners(),

    provideRouter(
      routes,
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled',
      }),
    ),

    provideClientHydration(),

    provideAppInitializer(() => {
      const auth = inject(AuthService);

      return firstValueFrom(auth.restoreSession());
    }),
  ],
};
