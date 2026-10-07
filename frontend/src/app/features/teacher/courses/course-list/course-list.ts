import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../../core/http/api-error';
import { PageHeader } from '../../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../../shared/ui/status-badge/status-badge';
import { CourseStatus, LEVEL_LABELS, TeacherCourse } from '../teacher-courses.models';
import { TeacherCoursesService } from '../teacher-courses.service';

type StatusFilter = CourseStatus | 'ALL';

@Component({
  selector: 'app-course-list',
  imports: [RouterLink, DatePipe, DecimalPipe, PageHeader, StatusBadge],
  templateUrl: './course-list.html',
  styleUrl: './course-list.scss',
})
export class CourseList {
  private readonly api = inject(TeacherCoursesService);
  readonly auth = inject(AuthService);

  readonly levelLabels = LEVEL_LABELS;

  readonly filters: { value: StatusFilter; label: string }[] = [
    { value: 'ALL', label: 'Todos' },
    { value: 'PUBLISHED', label: 'Publicados' },
    { value: 'DRAFT', label: 'Borradores' },
    { value: 'ARCHIVED', label: 'Archivados' },
  ];

  readonly courses = signal<TeacherCourse[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');

  readonly status = signal<StatusFilter>('ALL');
  readonly search = signal('');

  /** Id del curso con una operación en curso (deshabilita sus botones). */
  readonly busyId = signal<number | null>(null);
  /** Id del curso que está pidiendo confirmación para eliminarse. */
  readonly confirmDeleteId = signal<number | null>(null);

  readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');

  readonly visible = computed(() => {
    const status = this.status();
    const term = this.search().trim().toLowerCase();

    return this.courses().filter(
      (course) =>
        (status === 'ALL' || course.status === status) &&
        (!term ||
          course.title.toLowerCase().includes(term) ||
          (course.category?.name.toLowerCase().includes(term) ?? false)),
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

  countFor(filter: StatusFilter): number {
    return filter === 'ALL'
      ? this.courses().length
      : this.courses().filter((course) => course.status === filter).length;
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  changeStatus(course: TeacherCourse, status: CourseStatus): void {
    this.begin(course.id);

    this.api.setStatus(course.id, status).subscribe({
      next: (updated) => {
        this.courses.update((list) =>
          list.map((item) => (item.id === course.id ? { ...item, status: updated.status } : item)),
        );
        this.notice.set(`«${course.title}» ahora está ${this.statusWord(status)}.`);
        this.busyId.set(null);
      },
      error: (error: unknown) => this.fail(error, 'No pudimos cambiar el estado del curso.'),
    });
  }

  askDelete(id: number): void {
    this.confirmDeleteId.set(id);
  }

  cancelDelete(): void {
    this.confirmDeleteId.set(null);
  }

  remove(course: TeacherCourse): void {
    this.begin(course.id);

    this.api.remove(course.id).subscribe({
      next: () => {
        this.courses.update((list) => list.filter((item) => item.id !== course.id));
        this.notice.set(`Se eliminó «${course.title}».`);
        this.confirmDeleteId.set(null);
        this.busyId.set(null);
      },
      error: (error: unknown) => {
        this.confirmDeleteId.set(null);
        this.fail(error, 'No pudimos eliminar el curso.');
      },
    });
  }

  private begin(id: number): void {
    this.error.set('');
    this.notice.set('');
    this.busyId.set(id);
  }

  private fail(error: unknown, fallback: string): void {
    this.error.set(apiErrorMessage(error, fallback));
    this.busyId.set(null);
  }

  private statusWord(status: CourseStatus): string {
    return { DRAFT: 'en borrador', PUBLISHED: 'publicado', ARCHIVED: 'archivado' }[status];
  }
}
