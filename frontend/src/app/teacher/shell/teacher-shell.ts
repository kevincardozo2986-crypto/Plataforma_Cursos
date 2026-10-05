import { NgTemplateOutlet } from '@angular/common';
import { Component, effect, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { TEACHER_NAV } from './teacher-nav';

const STORAGE_KEY = 'campus.teacherSidebar';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed';
  } catch {
    // Sin almacenamiento (modo privado, SSR…): arranca abierto.
    return false;
  }
}

/** Estructura del área del docente: menú lateral a la izquierda y la página a la derecha. */
@Component({
  selector: 'app-teacher-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet],
  templateUrl: './teacher-shell.html',
  styleUrl: './teacher-shell.scss',
})
export class TeacherShell {
  /** Lo que ya funciona, arriba. */
  readonly available = TEACHER_NAV.filter((item) => item.ready);

  /** Lo que viene, en un grupo aparte y atenuado: así no hace falta marcar cada ítem. */
  readonly upcoming = TEACHER_NAV.filter((item) => !item.ready);

  /** Escritorio: el menú se contrae a una barra de íconos. Se recuerda entre visitas. */
  readonly collapsed = signal(readCollapsed());

  /** Pantallas pequeñas: el menú se despliega con un botón. */
  readonly open = signal(false);

  constructor() {
    effect(() => {
      const value = this.collapsed() ? 'collapsed' : 'open';

      try {
        localStorage.setItem(STORAGE_KEY, value);
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
