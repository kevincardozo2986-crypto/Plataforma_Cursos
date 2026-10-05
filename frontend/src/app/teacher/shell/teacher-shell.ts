import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { TEACHER_NAV } from './teacher-nav';

/** Estructura del área del docente: menú lateral a la izquierda y la página a la derecha. */
@Component({
  selector: 'app-teacher-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './teacher-shell.html',
  styleUrl: './teacher-shell.scss',
})
export class TeacherShell {
  readonly nav = TEACHER_NAV;

  /** En pantallas pequeñas el menú se despliega con un botón. */
  readonly open = signal(false);

  toggle(): void {
    this.open.update((value) => !value);
  }

  close(): void {
    this.open.set(false);
  }
}
