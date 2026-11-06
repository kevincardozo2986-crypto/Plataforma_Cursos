import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { SiteHeader } from '../site-header/site-header';

/** Estructura común: encabezado fijo arriba y la página activa debajo. */
@Component({
  selector: 'app-main-layout',
  imports: [SiteHeader, RouterOutlet],
  template: `
    <app-site-header [class.auth-header]="authPage()" />
    <router-outlet />
  `,
  styles: `
    :host {
      display: block;
    }

    app-site-header.auth-header {
      position: fixed;
      inset: 0 0 auto;
    }
  `,
})
export class MainLayout {
  private readonly router = inject(Router);
  readonly authPage = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
      map((url) => /^\/(login|register)\/?$/.test(url.split(/[?#]/)[0])),
    ),
    { initialValue: false },
  );
}
