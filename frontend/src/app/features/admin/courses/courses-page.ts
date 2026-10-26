import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  AdminCourse,
  AdminService,
  COURSE_STATUS_LABELS,
  CourseStatus,
} from '../../../core/admin/admin.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { Icon } from '../../../shared/ui/icon/icon';

const PAGE_SIZE = 20;

/** Todos los cursos de la plataforma: buscar, ver su estado y publicarlos, archivarlos o devolverlos a borrador. */
@Component({
  selector: 'app-admin-courses',
  imports: [DatePipe, RouterLink, Icon],
  templateUrl: './courses-page.html',
  styleUrls: ['../admin-common.scss', './courses-page.scss'],
})
export class CoursesPage {
  private readonly api = inject(AdminService);

  readonly statusLabels = COURSE_STATUS_LABELS;
  readonly statuses: CourseStatus[] = ['PUBLISHED', 'DRAFT', 'ARCHIVED'];

  readonly courses = signal<AdminCourse[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busyId = signal<number | null>(null);
  readonly pending = signal<{ id: number; status: CourseStatus } | null>(null);

  readonly q = signal('');
  readonly status = signal<CourseStatus | ''>('');
  readonly offset = signal(0);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private request: Subscription | null = null;

  readonly from = computed(() => (this.total() === 0 ? 0 : this.offset() + 1));
  readonly to = computed(() => Math.min(this.offset() + PAGE_SIZE, this.total()));
  readonly hasPrev = computed(() => this.offset() > 0);
  readonly hasNext = computed(() => this.offset() + PAGE_SIZE < this.total());

  constructor() {
    this.load();
  }

  private load(): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');

    this.request = this.api
      .courses({ q: this.q(), status: this.status(), limit: PAGE_SIZE, offset: this.offset() })
      .subscribe({
        next: (page) => {
          this.courses.set(page.items);
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos cargar los cursos.'));
          this.loading.set(false);
        },
      });
  }

  onSearch(event: Event): void {
    this.q.set((event.target as HTMLInputElement).value);

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.offset.set(0);
      this.load();
    }, 350);
  }

  setStatus(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value as CourseStatus | '');
    this.offset.set(0);
    this.load();
  }

  page(step: 1 | -1): void {
    this.offset.update((value) => Math.max(0, value + step * PAGE_SIZE));
    this.load();
  }

  tone(status: CourseStatus): string {
    return status === 'PUBLISHED' ? 'ok' : status === 'DRAFT' ? 'warn' : '';
  }

  /** Los estados a los que puede pasar desde el actual. */
  targets(
    course: AdminCourse,
  ): { status: CourseStatus; label: string; icon: 'check-circle' | 'eye' | 'ban' }[] {
    switch (course.status) {
      case 'PUBLISHED':
        return [
          { status: 'DRAFT', label: 'Pasar a borrador', icon: 'eye' },
          { status: 'ARCHIVED', label: 'Archivar', icon: 'ban' },
        ];
      case 'DRAFT':
        return [{ status: 'PUBLISHED', label: 'Publicar', icon: 'check-circle' }];
      default:
        return [
          { status: 'PUBLISHED', label: 'Publicar', icon: 'check-circle' },
          { status: 'DRAFT', label: 'Pasar a borrador', icon: 'eye' },
        ];
    }
  }

  ask(course: AdminCourse, status: CourseStatus): void {
    this.pending.set({ id: course.id, status });
  }

  cancel(): void {
    this.pending.set(null);
  }

  confirm(course: AdminCourse): void {
    const change = this.pending();

    if (!change) {
      return;
    }

    this.error.set('');
    this.notice.set('');
    this.busyId.set(course.id);

    this.api.setCourseStatus(course.id, change.status).subscribe({
      next: () => {
        this.courses.update((list) =>
          list.map((item) => (item.id === course.id ? { ...item, status: change.status } : item)),
        );
        this.notice.set(
          `«${course.title}» ahora está ${COURSE_STATUS_LABELS[change.status].toLowerCase()}.`,
        );
        this.pending.set(null);
        this.busyId.set(null);
      },
      error: (error: unknown) => {
        // Por ejemplo, un curso sin módulos no se puede publicar: el servidor explica qué falta.
        this.error.set(apiErrorMessage(error, 'No pudimos cambiar el estado del curso.'));
        this.pending.set(null);
        this.busyId.set(null);
      },
    });
  }
}
