import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SiteHeader } from '../site-header/site-header';

/** Estructura común: encabezado fijo arriba y la página activa debajo. */
@Component({
  selector: 'app-main-layout',
  imports: [SiteHeader, RouterOutlet],
  template: `
    <app-site-header />
    <router-outlet />
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class MainLayout {}
