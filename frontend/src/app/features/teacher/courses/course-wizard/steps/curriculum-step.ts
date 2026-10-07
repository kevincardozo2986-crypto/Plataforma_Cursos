import { Component } from '@angular/core';

import { CourseContent } from '../../course-content/course-content';

/**
 * Paso 2: Currículo. Reutiliza el constructor de módulos, lecciones y
 * evaluaciones. No tiene botón de guardar propio: cada cambio se guarda al
 * momento, así que no registra nada en el asistente.
 */
@Component({
  selector: 'app-curriculum-step',
  imports: [CourseContent],
  template: `<app-course-content [embedded]="true" />`,
})
export class CurriculumStep {}
