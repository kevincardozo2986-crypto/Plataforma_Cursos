import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { PageHeader } from '../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { LEVEL_LABELS, TeacherCourse } from '../courses/teacher-courses.models';
import { TeacherCoursesService } from '../courses/teacher-courses.service';

@Component({
  selector: 'app-teacher-dashboard',
  imports: [RouterLink, DatePipe, PageHeader, StatusBadge],
  templateUrl: './teacher-dashboard.html',
  styleUrl: './teacher-dashboard.scss',
})
export class TeacherDashboard {
  private readonly api = inject(TeacherCoursesService);
  readonly auth = inject(AuthService);

  readonly levelLabels = LEVEL_LABELS;

  readonly courses = signal<TeacherCourse[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly stats = computed(() => {
    const courses = this.courses();
    const count = (status: TeacherCourse['status']) =>
      courses.filter((course) => course.status === status).length;

    return [
      { label: 'Cursos', value: courses.length, tone: 'total' },
      { label: 'Publicados', value: count('PUBLISHED'), tone: 'ok' },
      { label: 'Borradores', value: count('DRAFT'), tone: 'warn' },
      { label: 'Archivados', value: count('ARCHIVED'), tone: 'muted' },
    ];
  });

  readonly recent = computed(() =>
    [...this.courses()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5),
  );

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
          this.error.set(apiErrorMessage(error, 'No pudimos cargar tus cursos.'));
          this.loading.set(false);
        },
      });
  }
}
