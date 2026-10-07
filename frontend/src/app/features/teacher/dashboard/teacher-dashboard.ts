import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { LEVEL_LABELS, TeacherCourse } from '../courses/teacher-courses.models';
import { TeacherCoursesService } from '../courses/teacher-courses.service';

@Component({
  selector: 'app-teacher-dashboard',
  imports: [RouterLink, DatePipe],
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
  readonly drafts = computed(() =>
    [...this.courses()]
      .filter((course) => course.status === 'DRAFT')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
  readonly draftPage = signal(1);
  readonly draftPageCount = computed(() => Math.max(1, Math.ceil(this.drafts().length / 6)));
  readonly currentDraftPage = computed(() => Math.min(this.draftPage(), this.draftPageCount()));
  readonly visibleDrafts = computed(() =>
    this.drafts().slice((this.currentDraftPage() - 1) * 6, this.currentDraftPage() * 6),
  );
  readonly draftPages = computed(() =>
    Array.from({ length: this.draftPageCount() }, (_, index) => index + 1),
  );

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
    [...this.courses()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
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
