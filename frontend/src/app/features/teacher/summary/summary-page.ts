import { Component } from '@angular/core';

import { TeacherStats } from './teacher-stats';

/** Apartado «Resumen» del menú del docente: sus cifras, la gráfica y la tabla por curso. */
@Component({
  selector: 'app-summary-page',
  imports: [TeacherStats],
  template: `
    <section class="panel-page">
      <div class="panel-container">
        <app-teacher-stats />
      </div>
    </section>
  `,
})
export class SummaryPage {}
