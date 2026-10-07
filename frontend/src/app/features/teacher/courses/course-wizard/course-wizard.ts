import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import { StatusBadge } from '../../../../shared/ui/status-badge/status-badge';
import { DRAFT_TITLE } from '../teacher-courses.models';
import { CourseWizardService } from './course-wizard.service';

export interface WizardStep {
  path: 'basics' | 'curriculum' | 'additional';
  label: string;
  hint: string;
}

export const WIZARD_STEPS: WizardStep[] = [
  { path: 'basics', label: 'Básicos', hint: 'Título, precio y acceso' },
  { path: 'curriculum', label: 'Currículo', hint: 'Módulos y lecciones' },
  { path: 'additional', label: 'Adicional', hint: 'Resumen y requisitos' },
];

/**
 * Asistente de creación y edición de un curso en tres pasos. Los botones
 * «Guardar borrador» y «Enviar» están siempre a la vista; cada paso se guarda
 * solo al cambiar de paso.
 */
@Component({
  selector: 'app-course-wizard',
  imports: [RouterOutlet, RouterLink, StatusBadge],
  providers: [CourseWizardService],
  templateUrl: './course-wizard.html',
  styleUrl: './course-wizard.scss',
})
export class CourseWizard {
  readonly wizard = inject(CourseWizardService);
  private readonly router = inject(Router);

  readonly steps = WIZARD_STEPS;
  readonly courseId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly currentIndex = computed(() => {
    const index = this.steps.findIndex((step) => this.url().includes(`/edit/${step.path}`));

    return index < 0 ? 0 : index;
  });

  readonly title = computed(() => {
    const title = this.wizard.course()?.title;

    return !title || title === DRAFT_TITLE ? 'Nuevo curso' : title;
  });

  readonly missing = computed(() => this.wizard.checklist().filter((item) => !item.done));

  constructor() {
    this.wizard.load(this.courseId);
  }

  /** Guarda el paso actual y, si todo va bien, navega al paso indicado. */
  goTo(index: number): void {
    const step = this.steps[index];

    if (!step || index === this.currentIndex()) {
      return;
    }

    this.wizard.saveCurrent().subscribe((saved) => {
      if (saved) {
        void this.router.navigate(['/teacher/courses', this.courseId, 'edit', step.path]);
      }
    });
  }

  previous(): void {
    this.goTo(this.currentIndex() - 1);
  }

  next(): void {
    this.goTo(this.currentIndex() + 1);
  }
}
