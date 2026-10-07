import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';

import { apiErrorMessage } from '../../../../core/http/api-error';
import {
  CourseStatus,
  CourseWithContent,
  DRAFT_TITLE,
  TeacherCourse,
} from '../teacher-courses.models';
import { TeacherCoursesService } from '../teacher-courses.service';

export interface ChecklistItem {
  label: string;
  done: boolean;
}

/** Lo que hace falta para poder enviar (publicar) un curso. Coincide con lo que valida el backend. */
export function publishChecklist(
  course: { title: string; description: string; modules?: unknown[] } | null,
): ChecklistItem[] {
  return [
    {
      label: 'Título',
      done: !!course && course.title.trim() !== '' && course.title !== DRAFT_TITLE,
    },
    { label: 'Descripción', done: !!course?.description.trim() },
    { label: 'Un módulo', done: (course?.modules?.length ?? 0) > 0 },
  ];
}

/**
 * Cómo se guarda el paso activo. Devuelve la petición, o null si el formulario
 * no es válido (el paso ya marcó sus errores en pantalla).
 */
export type StepSaver = () => Observable<TeacherCourse> | null;

/**
 * Estado compartido del asistente de creación. Lo provee CourseWizard, así que
 * vive mientras se esté dentro del asistente y lo comparten sus pasos.
 */
@Injectable()
export class CourseWizardService {
  private readonly api = inject(TeacherCoursesService);

  readonly course = signal<CourseWithContent | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal('');

  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  readonly checklist = computed(() => publishChecklist(this.course()));
  readonly isPublished = computed(() => this.course()?.status === 'PUBLISHED');

  private saver: StepSaver | null = null;

  load(id: number): void {
    this.loading.set(true);
    this.loadError.set('');

    this.api.get(id).subscribe({
      next: (course) => {
        this.course.set(course);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(apiErrorMessage(error, 'No pudimos cargar el curso.'));
        this.loading.set(false);
      },
    });
  }

  /** El paso activo dice cómo guardarse. Devuelve la función para anular el registro. */
  register(saver: StepSaver): () => void {
    this.saver = saver;

    return () => {
      if (this.saver === saver) {
        this.saver = null;
      }
    };
  }

  /** Quita los avisos viejos: se llama cuando el profesor vuelve a editar. */
  clearMessages(): void {
    this.error.set('');
    this.notice.set('');
  }

  /** Incorpora lo que devolvió el backend sin perder los módulos ya cargados. */
  applySaved(saved: TeacherCourse): void {
    this.course.update((course) => (course ? { ...course, ...saved } : course));
  }

  /** true = guardado (o no había nada que guardar); false = formulario inválido o error. */
  saveCurrent(): Observable<boolean> {
    this.error.set('');
    this.notice.set('');

    if (!this.saver) {
      return of(true);
    }

    const request = this.saver();

    if (!request) {
      this.error.set('Revisa los campos marcados antes de continuar.');
      return of(false);
    }

    this.saving.set(true);

    return request.pipe(
      tap((saved) => {
        this.applySaved(saved);
        this.saving.set(false);
      }),
      map(() => true),
      catchError((error: unknown) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(error, 'No pudimos guardar los cambios.'));

        return of(false);
      }),
    );
  }

  saveDraft(): void {
    this.saveCurrent().subscribe((saved) => {
      if (saved) {
        this.notice.set(this.isPublished() ? 'Cambios guardados.' : 'Borrador guardado.');
      }
    });
  }

  /** "Enviar": guarda el paso y publica. Si falta algo, el backend dice qué. */
  publish(): void {
    this.saveCurrent().subscribe((saved) => {
      if (saved) {
        this.changeStatus('PUBLISHED', 'El curso está publicado y ya aparece en el catálogo.');
      }
    });
  }

  unpublish(): void {
    this.error.set('');
    this.notice.set('');
    this.changeStatus('DRAFT', 'El curso volvió a borrador.');
  }

  private changeStatus(status: CourseStatus, success: string): void {
    const id = this.course()?.id;

    if (id === undefined) {
      return;
    }

    this.saving.set(true);

    this.api.setStatus(id, status).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.course.update((course) => (course ? { ...course, status: updated.status } : course));
        this.notice.set(success);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(error, 'No pudimos cambiar el estado del curso.'));
      },
    });
  }
}
