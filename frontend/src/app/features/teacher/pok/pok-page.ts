import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { concatMap, forkJoin, from } from 'rxjs';

import { apiErrorMessage } from '../../../core/http/api-error';
import {
  PokConnection,
  PokCourse,
  PokService,
  PokTemplate,
} from '../../../core/pok/pok.service';

type Filter = 'all' | 'pok' | 'pdf' | 'wait';
type Panel = 'mode' | 'hook' | null;

interface Step {
  id: 'conn' | 'mode' | 'credits' | 'hook';
  ok: boolean;
  title: string;
  detail: string;
  /** Texto del botón de la derecha; null = sin botón. */
  action: string | null;
  /** 'link' abre POK; 'panel' despliega ayuda debajo del paso. */
  kind?: 'link' | 'panel';
  level: 'bad' | 'warn';
}

const STATUS_LABELS: Record<PokCourse['status'], string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Archivado',
};

const COVERS = ['sand', 'teal', 'blue', 'green'] as const;
/** Dibujo decorativo del código QR de la credencial (no es un código real). */
const QR = [1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1];
const RING = 251.33;

/**
 * Pantalla POK del docente: estado de la conexión, vista previa de la credencial y qué entrega cada
 * curso (el PDF de la plataforma o la credencial digital de POK, nunca las dos).
 */
@Component({
  selector: 'app-pok-page',
  templateUrl: './pok-page.html',
  styleUrl: './pok-page.scss',
})
export class PokPage {
  private readonly api = inject(PokService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  readonly statusLabels = STATUS_LABELS;
  readonly ring = RING;
  readonly qr = QR;
  readonly tabs: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'pok', label: 'POK' },
    { id: 'pdf', label: 'PDF' },
    { id: 'wait', label: 'En espera' },
  ];

  readonly loading = signal(true);
  readonly connection = signal<PokConnection | null>(null);
  readonly templates = signal<PokTemplate[]>([]);
  readonly templatesError = signal('');
  readonly courses = signal<PokCourse[]>([]);
  readonly error = signal('');
  readonly toast = signal('');
  readonly busyId = signal<number | null>(null);
  readonly sending = signal(false);

  readonly filter = signal<Filter>('all');
  readonly open = signal<Panel>(null);
  readonly selectedId = signal<number | null>(null);
  readonly copied = signal(false);

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /** La conexión, solo cuando POK está activo. */
  readonly conn = computed(() => {
    const connection = this.connection();

    return connection?.enabled ? connection : null;
  });

  readonly credits = computed(() => this.conn()?.organization?.availableCredits ?? 0);
  readonly pokCourses = computed(() => this.courses().filter((c) => c.pokTemplateId !== null));
  readonly pdfCourses = computed(() => this.courses().filter((c) => c.pokTemplateId === null));
  readonly waiting = computed(() => this.pokCourses().filter((c) => c.unsent > 0));
  readonly unsentTotal = computed(() => this.pokCourses().reduce((sum, c) => sum + c.unsent, 0));

  readonly webhookUrl = computed(() => `${this.document.location?.origin ?? ''}/api/pok/webhook`);

  readonly steps = computed<Step[]>(() => {
    const conn = this.conn();

    if (!conn) return [];

    const credits = conn.organization?.availableCredits ?? 0;

    return [
      {
        id: 'conn',
        ok: conn.organization !== null,
        title: 'Conectado a POK',
        detail: conn.organization
          ? `${conn.emitter} · ${conn.organization.name}`
          : 'No pudimos leer tu organización de POK. Revisa la clave de API.',
        action: null,
        level: 'bad',
      },
      {
        id: 'mode',
        ok: !conn.draftMode,
        title: conn.draftMode ? 'Modo de pruebas' : 'Emisión real',
        detail: conn.draftMode
          ? 'Las credenciales quedan en borrador en POK: no se emiten.'
          : 'Las credenciales llegan de verdad a los estudiantes',
        action: conn.draftMode ? 'Cómo cambiarlo' : null,
        kind: 'panel',
        level: 'warn',
      },
      {
        id: 'credits',
        ok: true,
        title: 'Créditos',
        detail: `${credits} disponibles · las credenciales básicas no gastan créditos`,
        action: 'Abrir POK',
        kind: 'link',
        level: 'warn',
      },
      {
        id: 'hook',
        ok: conn.webhookConfigured,
        title: 'Avisos de POK (webhook)',
        detail: conn.webhookConfigured
          ? 'POK avisa cuando un estudiante acepta su credencial'
          : 'Sin configurar: los estados no se actualizan solos',
        action: conn.webhookConfigured ? null : 'Configurar',
        kind: 'panel',
        level: 'warn',
      },
    ];
  });

  readonly readyCount = computed(() => this.steps().filter((s) => s.ok).length);
  readonly missing = computed(() => this.steps().length - this.readyCount());
  readonly ringOffset = computed(() => RING * (1 - this.readyCount() / 4));

  readonly counts = computed(() => ({
    all: this.courses().length,
    pok: this.pokCourses().length,
    pdf: this.pdfCourses().length,
    wait: this.waiting().length,
  }));

  readonly visibleCourses = computed(() => {
    switch (this.filter()) {
      case 'pok':
        return this.pokCourses();
      case 'pdf':
        return this.pdfCourses();
      case 'wait':
        return this.waiting();
      default:
        return this.courses();
    }
  });

  /** El curso que se muestra en la vista previa: el elegido, o el primero. */
  readonly selected = computed(
    () => this.courses().find((c) => c.id === this.selectedId()) ?? this.courses()[0] ?? null,
  );

  /** Cambia cuando cambia el curso o su tipo: vuelve a dibujar la tarjeta con su animación. */
  readonly previewKey = computed(() => {
    const course = this.selected();

    return course ? `${course.id}:${course.pokTemplateId ?? 'pdf'}` : 'none';
  });

  readonly selectedTemplateName = computed(() => {
    const course = this.selected();

    if (!course?.pokTemplateId) return '';

    return (
      this.templates().find((t) => t.id === course.pokTemplateId)?.name ??
      course.pokTemplateName ??
      course.pokTemplateId
    );
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.toastTimer) clearTimeout(this.toastTimer);
    });
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

  // --- Interacción ---

  showToast(message: string): void {
    this.toast.set(message);

    if (this.toastTimer) clearTimeout(this.toastTimer);

    this.toastTimer = setTimeout(() => this.toast.set(''), 3200);
  }

  togglePanel(panel: 'mode' | 'hook'): void {
    this.open.update((current) => (current === panel ? null : panel));
  }

  select(course: PokCourse): void {
    this.selectedId.set(course.id);
  }

  setFilter(filter: Filter): void {
    this.filter.set(filter);
  }

  /** ¿El curso entrega la credencial de POK? */
  isPok(course: PokCourse): boolean {
    return course.pokTemplateId !== null;
  }

  /** Iniciales para la ficha del curso («Curso Constructor» → «CC»). */
  mono(course: PokCourse): string {
    const words = course.title.trim().split(/\s+/).filter(Boolean);

    return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? words[0]?.[1] ?? '')).toUpperCase();
  }

  cover(course: PokCourse): string {
    return COVERS[this.courses().indexOf(course) % COVERS.length] ?? 'blue';
  }

  /** Cambia lo que entrega un curso: el PDF de la plataforma o la credencial de POK. */
  setType(course: PokCourse, type: 'PDF' | 'POK'): void {
    this.select(course);

    if ((type === 'POK') === this.isPok(course)) return;

    if (type === 'PDF') {
      this.apply(course, null);

      return;
    }

    const first = this.templates()[0];

    if (!first) {
      this.error.set('No hay diseños en tu cuenta de POK. Créalos en POK y vuelve a cargar esta pantalla.');

      return;
    }

    this.apply(course, first.id);
  }

  /** Elige el diseño de POK de un curso. */
  pickTemplate(course: PokCourse, templateId: string): void {
    this.select(course);

    if (course.pokTemplateId !== templateId) this.apply(course, templateId);
  }

  private apply(course: PokCourse, templateId: string | null): void {
    this.busyId.set(course.id);
    this.error.set('');

    this.api.setTemplate(course.id, templateId).subscribe({
      next: (result) => {
        this.courses.update((list) =>
          list.map((item) =>
            item.id === course.id
              ? { ...item, pokTemplateId: result.pokTemplateId, pokTemplateName: result.pokTemplateName }
              : item,
          ),
        );
        this.showToast(
          result.pokTemplateName
            ? `«${course.title}» ahora entrega la credencial de POK («${result.pokTemplateName}»)` +
                (result.issued > 0 ? ` y se emitieron ${result.issued} credenciales.` : '.')
            : `«${course.title}» vuelve a entregar el certificado PDF de la plataforma.`,
        );
        this.busyId.set(null);
        this.api.courses().subscribe({ next: (courses) => this.courses.set(courses) });
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos cambiar el certificado del curso.'));
        this.busyId.set(null);
      },
    });
  }

  send(course: PokCourse): void {
    this.busyId.set(course.id);
    this.error.set('');

    this.api.sendPending(course.id).subscribe({
      next: (result) => {
        this.showToast(
          result.failed === 0
            ? `${result.sent} credenciales de «${course.title}» enviadas a POK.`
            : `De ${result.total} credenciales de «${course.title}», ${result.sent} se enviaron y ${result.failed} fallaron. Revisa el motivo en Certificados → Emitidos.`,
        );
        this.busyId.set(null);
        this.api.courses().subscribe({ next: (courses) => this.courses.set(courses) });
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos enviar las credenciales a POK.'));
        this.busyId.set(null);
      },
    });
  }

  /** Envía a POK las credenciales en espera de todos los cursos, de a uno. */
  sendAll(): void {
    const list = this.waiting();

    if (list.length === 0 || this.sending()) return;

    this.sending.set(true);
    this.error.set('');

    let sent = 0;
    let failed = 0;

    from(list)
      .pipe(concatMap((course) => this.api.sendPending(course.id)))
      .subscribe({
        next: (result) => {
          sent += result.sent;
          failed += result.failed;
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos enviar las credenciales a POK.'));
          this.sending.set(false);
        },
        complete: () => {
          this.showToast(
            failed === 0 ? `${sent} credenciales enviadas a POK.` : `${sent} enviadas y ${failed} fallaron.`,
          );
          this.sending.set(false);
          this.api.courses().subscribe({ next: (courses) => this.courses.set(courses) });
        },
      });
  }

  copyWebhook(): void {
    const copy = this.document.defaultView?.navigator?.clipboard?.writeText(this.webhookUrl());

    void copy?.then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    });
  }

  /** Inclina la tarjeta según dónde está el mouse (se ignora con «reducir movimiento»). */
  tilt(event: MouseEvent): void {
    const view = this.document.defaultView;

    if (view?.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const el = event.currentTarget as HTMLElement;
    const box = el.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;

    el.style.transform = `rotateY(${(x - 0.5) * 16}deg) rotateX(${(0.5 - y) * 12}deg)`;
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
  }

  untilt(event: MouseEvent): void {
    (event.currentTarget as HTMLElement).style.transform = '';
  }
}
