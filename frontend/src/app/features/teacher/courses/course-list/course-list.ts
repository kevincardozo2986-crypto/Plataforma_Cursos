import { PublicUrlPipe } from '../../../../core/http/public-url.pipe';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../../core/http/api-error';
import { CourseStatus, TeacherCourse } from '../teacher-courses.models';
import { TeacherCoursesService } from '../teacher-courses.service';
import {
  CourseSort,
  CoverColor,
  SETUP_STEPS,
  coverColorOf,
  isUntitled,
  levelLabel,
  matchesQuery,
  monogram,
  priceLabel,
  relativeDate,
  relativeLower,
  setupDone,
  setupSteps,
  sortCourses,
} from './course-list-helpers';

type Tab = 'ALL' | CourseStatus;
type View = 'grid' | 'list';

const VIEW_KEY = 'campus.teacher.coursesView';

/** Los rectángulos del dibujo del encabezado: x, y, ancho, alto. */
const ART_TILES: [number, number, number, number][] = [
  [224, 120, 40, 40],
  [276, 120, 64, 40],
  [352, 120, 40, 92],
  [224, 172, 116, 40],
  [404, 120, 40, 40],
  [404, 172, 40, 40],
];

function storedView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

/**
 * Biblioteca de cursos del docente: portada con las cifras, el borrador que dejó a medias, filtros,
 * cuadrícula o lista y el menú de acciones de cada curso (archivar se puede deshacer).
 */
@Component({
  selector: 'app-course-list',
  imports: [PublicUrlPipe, RouterLink, NgTemplateOutlet],
  templateUrl: './course-list.html',
  styleUrl: './course-list.scss',
})
export class CourseList {
  private readonly api = inject(TeacherCoursesService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  readonly auth = inject(AuthService);

  readonly tabs: { value: Tab; label: string }[] = [
    { value: 'ALL', label: 'Todos' },
    { value: 'PUBLISHED', label: 'Publicados' },
    { value: 'DRAFT', label: 'Borradores' },
    { value: 'ARCHIVED', label: 'Archivados' },
  ];
  readonly steps = SETUP_STEPS;
  readonly artTiles = ART_TILES.map(([x, y, w, h], index) => ({
    x,
    y,
    w,
    h,
    o: [0.25, 0.45, 0.6][index % 3],
  }));

  // Estado
  readonly courses = signal<TeacherCourse[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly tab = signal<Tab>('ALL');
  readonly query = signal('');
  readonly sort = signal<CourseSort>('rec');
  readonly view = signal<View>(storedView());
  readonly menuId = signal<number | null>(null);
  readonly confirmDeleteId = signal<number | null>(null);
  readonly busyId = signal<number | null>(null);
  readonly toast = signal<{ message: string; undo: (() => void) | null } | null>(null);

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');

  readonly counts = computed(() => {
    const list = this.courses();

    return {
      ALL: list.length,
      PUBLISHED: list.filter((course) => course.status === 'PUBLISHED').length,
      DRAFT: list.filter((course) => course.status === 'DRAFT').length,
      ARCHIVED: list.filter((course) => course.status === 'ARCHIVED').length,
    } satisfies Record<Tab, number>;
  });

  readonly studentsTotal = computed(() =>
    this.courses()
      .filter((course) => course.status === 'PUBLISHED')
      .reduce((sum, course) => sum + (course.library?.enrolled ?? 0), 0),
  );

  /** Las 3 portadas del encabezado: los cursos tocados más recientemente. */
  readonly minis = computed(() => sortCourses(this.courses(), 'rec').slice(0, 3));

  /** El borrador que se editó por última vez. */
  readonly resume = computed(() =>
    sortCourses(
      this.courses().filter((course) => course.status === 'DRAFT'),
      'rec',
    ).at(0),
  );

  readonly visible = computed(() => {
    const tab = this.tab();
    const query = this.query();

    return sortCourses(
      this.courses().filter(
        (course) => (tab === 'ALL' || course.status === tab) && matchesQuery(course, query),
      ),
      this.sort(),
    );
  });

  constructor() {
    this.api
      .list()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (courses) => {
          this.courses.set(courses);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos cargar los cursos.'));
          this.loading.set(false);
        },
      });
  }

  // --- Datos de una tarjeta (puros: se usan desde la plantilla) ---

  readonly colorOf = (course: TeacherCourse): CoverColor => coverColorOf(course.id);
  readonly mono = (course: TeacherCourse): string => monogram(course.title);
  readonly untitled = (course: TeacherCourse): boolean => isUntitled(course);
  readonly level = levelLabel;
  readonly price = (course: TeacherCourse): string => priceLabel(course.price);
  readonly done = setupDone;
  readonly stepsOf = setupSteps;
  readonly when = (course: TeacherCourse): string => relativeDate(course.updatedAt);
  readonly whenLower = (course: TeacherCourse): string => relativeLower(course.updatedAt);
  readonly enrolled = (course: TeacherCourse): number => course.library?.enrolled ?? 0;
  readonly avg = (course: TeacherCourse): number => course.library?.avgProgress ?? 0;
  readonly faces = (course: TeacherCourse): number => Math.min(3, this.enrolled(course));
  readonly isPok = (course: TeacherCourse): boolean => course.library?.certificate === 'POK';

  // --- Filtros y vista ---

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.menuId.set(null);
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  onSort(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as CourseSort);
  }

  setView(view: View): void {
    this.view.set(view);
    this.menuId.set(null);

    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Sin almacenamiento: la vista simplemente no se recuerda.
    }
  }

  resetFilters(): void {
    this.tab.set('ALL');
    this.query.set('');
  }

  // --- Menú de acciones ---

  toggleMenu(id: number): void {
    const open = this.menuId() === id;

    this.confirmDeleteId.set(null);
    this.menuId.set(open ? null : id);

    if (!open) {
      // El foco pasa al primer elemento del menú, para usarlo con teclado.
      setTimeout(() =>
        this.host.nativeElement.querySelector<HTMLElement>('.mc-menu button')?.focus(),
      );
    }
  }

  private closeMenu(restoreFocus: boolean): void {
    const id = this.menuId();

    this.menuId.set(null);
    this.confirmDeleteId.set(null);

    if (restoreFocus && id !== null) {
      this.host.nativeElement.querySelector<HTMLElement>(`[data-menu="${id}"]`)?.focus();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menuId() !== null) this.closeMenu(true);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.menuId() === null) return;

    const target = event.target as Element | null;

    // Los clics en el propio menú o en su botón los manejan sus controladores.
    if (!target?.closest('.mc-menu, [data-menu]')) this.closeMenu(false);
  }

  /** Flechas arriba/abajo recorren las opciones del menú. */
  onMenuKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    event.preventDefault();

    const items = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('.mc-menu button'),
    );
    const index = items.indexOf(this.document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;

    items[(next + items.length) % items.length]?.focus();
  }

  // --- Acciones ---

  manage(course: TeacherCourse): void {
    this.closeMenu(false);
    void this.router.navigate(['/teacher/courses', course.id, 'edit']);
  }

  viewAsStudent(course: TeacherCourse): void {
    this.closeMenu(false);
    void this.router.navigate(['/courses', course.id]);
  }

  viewStudents(course: TeacherCourse): void {
    this.closeMenu(false);
    void this.router.navigate(['/teacher/students'], { queryParams: { course: course.id } });
  }

  /** Copia los datos generales (título, descripción, precio, nivel, categoría y portada) a un borrador nuevo. */
  duplicate(course: TeacherCourse): void {
    this.closeMenu(false);
    this.busyId.set(course.id);

    const title = `${isUntitled(course) ? 'Curso sin título' : course.title} (copia)`;

    this.api.createDraft().subscribe({
      next: (draft) => {
        this.api
          .update(draft.id, {
            title,
            description: course.description,
            price: Number(course.price),
            level: course.level,
            categoryId: course.categoryId,
            imageUrl: course.imageUrl,
          })
          .subscribe({
            next: (copy) => {
              // El servidor reutiliza el borrador en blanco que ya existiera: se reemplaza por id
              // para que ese borrador no aparezca dos veces.
              this.courses.update((list) => [
                {
                  ...copy,
                  isOwner: true,
                  category: course.category,
                  library: { enrolled: 0, avgProgress: 0, lessons: 0, certificate: 'PLATFORM' },
                },
                ...list.filter((item) => item.id !== copy.id),
              ]);
              this.busyId.set(null);
              this.showToast('Curso duplicado como borrador. El contenido no se copia.');
            },
            error: (error: unknown) => {
              // No dejar un borrador vacío huérfano.
              this.api.remove(draft.id).subscribe({ error: () => undefined });
              this.fail(error, 'No pudimos duplicar el curso.');
            },
          });
      },
      error: (error: unknown) => this.fail(error, 'No pudimos duplicar el curso.'),
    });
  }

  /** Archiva (o restaura) al instante y avisa con «Deshacer»; si el servidor falla, vuelve atrás. */
  toggleArchive(course: TeacherCourse): void {
    this.closeMenu(false);

    const previous = course.status;
    const restoring = previous === 'ARCHIVED';
    const label = course.title && !isUntitled(course) ? `«${course.title}»` : 'El curso';

    this.setLocalStatus(course.id, restoring ? 'PUBLISHED' : 'ARCHIVED');
    this.api.setStatus(course.id, restoring ? 'PUBLISHED' : 'ARCHIVED').subscribe({
      next: (updated) => {
        this.setLocalStatus(course.id, updated.status);
        this.showToast(restoring ? `${label} se restauró.` : `${label} se archivó.`, () =>
          this.revertStatus(course.id, previous),
        );
      },
      error: (error: unknown) => {
        if (restoring) {
          // Un curso que ya no cumple los requisitos para publicarse vuelve como borrador.
          this.api.setStatus(course.id, 'DRAFT').subscribe({
            next: (updated) => {
              this.setLocalStatus(course.id, updated.status);
              this.showToast(`${label} se restauró como borrador.`);
            },
            error: (second: unknown) => {
              this.setLocalStatus(course.id, previous);
              this.showToast(apiErrorMessage(second, 'No pudimos restaurar el curso.'));
            },
          });

          return;
        }

        this.setLocalStatus(course.id, previous);
        this.showToast(apiErrorMessage(error, 'No pudimos archivar el curso.'));
      },
    });
  }

  private revertStatus(id: number, status: CourseStatus): void {
    this.setLocalStatus(id, status);
    this.api.setStatus(id, status).subscribe({
      next: () => this.showToast('Listo, se deshizo.'),
      error: (error: unknown) => {
        this.showToast(apiErrorMessage(error, 'No pudimos deshacer el cambio.'));
        this.api.list().subscribe({ next: (courses) => this.courses.set(courses) });
      },
    });
  }

  askDelete(course: TeacherCourse): void {
    this.confirmDeleteId.set(course.id);
  }

  remove(course: TeacherCourse): void {
    this.closeMenu(false);
    this.busyId.set(course.id);

    this.api.remove(course.id).subscribe({
      next: () => {
        this.courses.update((list) => list.filter((item) => item.id !== course.id));
        this.busyId.set(null);
        this.showToast('Se eliminó el curso.');
      },
      error: (error: unknown) => this.fail(error, 'No pudimos eliminar el curso.'),
    });
  }

  runUndo(): void {
    const undo = this.toast()?.undo;

    this.toast.set(null);
    undo?.();
  }

  private setLocalStatus(id: number, status: CourseStatus): void {
    this.courses.update((list) =>
      list.map((item) => (item.id === id ? { ...item, status } : item)),
    );
  }

  private fail(error: unknown, fallback: string): void {
    this.busyId.set(null);
    this.showToast(apiErrorMessage(error, fallback));
  }

  private showToast(message: string, undo: (() => void) | null = null): void {
    this.toast.set({ message, undo });

    if (this.toastTimer) clearTimeout(this.toastTimer);

    this.toastTimer = setTimeout(() => this.toast.set(null), undo ? 6000 : 3500);
  }
}
