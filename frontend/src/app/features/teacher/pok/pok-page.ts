import { Component, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';

import { apiErrorMessage } from '../../../core/http/api-error';
import {
  PokConnection,
  PokCourse,
  PokService,
  PokTemplate,
} from '../../../core/pok/pok.service';
import { Icon } from '../../../shared/ui/icon/icon';

const STATUS_LABELS: Record<PokCourse['status'], string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Archivado',
};

/**
 * Pantalla POK del docente: estado de la conexión (organización y créditos), los diseños de
 * certificado de su cuenta de POK y cuál usa cada curso al emitir las credenciales digitales.
 */
@Component({
  selector: 'app-pok-page',
  imports: [Icon],
  templateUrl: './pok-page.html',
  styleUrl: './pok-page.scss',
})
export class PokPage {
  private readonly api = inject(PokService);

  readonly statusLabels = STATUS_LABELS;

  readonly loading = signal(true);
  readonly connection = signal<PokConnection | null>(null);
  readonly templates = signal<PokTemplate[]>([]);
  readonly templatesError = signal('');
  readonly courses = signal<PokCourse[]>([]);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busyId = signal<number | null>(null);

  readonly enabled = computed(() => this.connection()?.enabled === true);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api.status().subscribe({
      next: (connection) => {
        this.connection.set(connection);

        if (!connection.enabled) {
          this.loading.set(false);

          return;
        }

        this.loadDetails();
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos consultar la conexión con POK.'));
        this.loading.set(false);
      },
    });
  }

  private loadDetails(): void {
    this.templatesError.set('');

    forkJoin({
      templates: this.api.templates(),
      courses: this.api.courses(),
    }).subscribe({
      next: ({ templates, courses }) => {
        this.templates.set(templates);
        this.courses.set(courses);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        // Si POK no responde igual se muestran los cursos para poder reintentar.
        this.templatesError.set(apiErrorMessage(error, 'No pudimos cargar los diseños de POK.'));
        this.api.courses().subscribe({
          next: (courses) => this.courses.set(courses),
          error: () => undefined,
        });
        this.loading.set(false);
      },
    });
  }

  /** El diseño que muestra la lista de un curso: el suyo, o el predeterminado. */
  chosen(course: PokCourse): string {
    return course.pokTemplateId ?? '';
  }

  /** ¿El diseño elegido ya no sale en la lista de POK (se borró allá)? Se sigue mostrando para poder cambiarlo. */
  isMissing(course: PokCourse): boolean {
    return (
      course.pokTemplateId !== null &&
      this.templates().length > 0 &&
      !this.templates().some((t) => t.id === course.pokTemplateId)
    );
  }

  choose(course: PokCourse, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    this.busyId.set(course.id);
    this.error.set('');
    this.notice.set('');

    this.api.setTemplate(course.id, value || null).subscribe({
      next: (result) => {
        this.courses.update((list) =>
          list.map((item) =>
            item.id === course.id
              ? {
                  ...item,
                  pokTemplateId: result.pokTemplateId,
                  pokTemplateName: result.pokTemplateName,
                }
              : item,
          ),
        );
        this.notice.set(
          result.pokTemplateName
            ? `«${course.title}» ahora entrega la credencial de POK con el diseño «${result.pokTemplateName}»` +
                (result.issued > 0 ? ` y se emitieron ${result.issued} credenciales a quienes ya habían terminado.` : '.')
            : `«${course.title}» vuelve a entregar el certificado de la plataforma.`,
        );
        this.busyId.set(null);
        this.api.courses().subscribe({ next: (courses) => this.courses.set(courses) });
      },
      error: (error: unknown) => {
        // La lista vuelve a lo que había: el servidor no guardó el cambio.
        (event.target as HTMLSelectElement).value = this.chosen(course);
        this.error.set(apiErrorMessage(error, 'No pudimos cambiar el diseño.'));
        this.busyId.set(null);
      },
    });
  }

  sendPending(course: PokCourse): void {
    this.busyId.set(course.id);
    this.error.set('');
    this.notice.set('');

    this.api.sendPending(course.id).subscribe({
      next: (result) => {
        this.notice.set(
          result.failed === 0
            ? `Se enviaron ${result.sent} certificados de «${course.title}» a POK.`
            : `De ${result.total} certificados de «${course.title}», ${result.sent} se enviaron y ${result.failed} fallaron. Revisa el motivo en Certificados → Emitidos.`,
        );
        this.busyId.set(null);
        this.api.courses().subscribe({ next: (courses) => this.courses.set(courses) });
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos enviar los certificados a POK.'));
        this.busyId.set(null);
      },
    });
  }
}
