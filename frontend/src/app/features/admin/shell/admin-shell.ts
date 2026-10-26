import { Component, effect, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { ADMIN_NAV } from './admin-nav';

const STORAGE_KEY = 'campus.adminSidebar';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

/** Estructura del área del administrador: menú lateral y la página. Usa los estilos del panel docente. */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-shell.html',
  styleUrl: '../../teacher/shell/teacher-shell.scss',
})
export class AdminShell {
  readonly items = ADMIN_NAV;
  readonly collapsed = signal(readCollapsed());
  readonly open = signal(false);

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, this.collapsed() ? 'collapsed' : 'open');
      } catch {
        /* La preferencia sigue funcionando durante la visita. */
      }
    });
  }

  toggleCollapsed(): void {
    this.collapsed.update((value) => !value);
  }

  toggle(): void {
    this.open.update((value) => !value);
  }

  close(): void {
    this.open.set(false);
  }
}
