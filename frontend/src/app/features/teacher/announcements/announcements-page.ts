import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  Announcement,
  AnnouncementsService,
} from '../../../core/announcements/announcements.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { hasRichFormatting, htmlToText, textToHtml } from '../../../core/utils/html-text';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { TeacherCourse } from '../courses/teacher-courses.models';
import { TeacherCoursesService } from '../courses/teacher-courses.service';

const PAGE_SIZE = 20;

/** Anuncios del docente a los inscritos de sus cursos. */
@Component({
  selector: 'app-announcements-page',
  imports: [ReactiveFormsModule, DatePipe, PageHeader],
  templateUrl: './announcements-page.html',
  styleUrl: './announcements-page.scss',
})
export class AnnouncementsPage {
  private readonly api = inject(AnnouncementsService);
  private readonly coursesApi = inject(TeacherCoursesService);

  readonly courses = signal<TeacherCourse[]>([]);
  readonly items = signal<Announcement[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');

  readonly courseFilter = signal<number | null>(null);
  readonly offset = signal(0);

  readonly from = computed(() => (this.total() === 0 ? 0 : this.offset() + 1));
  readonly to = computed(() => Math.min(this.offset() + PAGE_SIZE, this.total()));
  readonly hasPrev = computed(() => this.offset() > 0);
  readonly hasNext = computed(() => this.offset() + PAGE_SIZE < this.total());

  // Nuevo anuncio
  readonly composing = signal(false);
  readonly publishing = signal(false);
  readonly composer = new FormGroup({
    courseId: new FormControl<number | null>(null, { validators: [Validators.required] }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(150)],
    }),
    body: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(10000)],
    }),
    notify: new FormControl(true, { nonNullable: true }),
  });

  // Edición y borrado de uno existente
  readonly editingId = signal<number | null>(null);
  readonly editLosesFormat = signal(false);
  readonly saving = signal(false);
  readonly editor = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(150)],
    }),
    body: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  readonly confirmDeleteId = signal<number | null>(null);
  readonly busyId = signal<number | null>(null);

  constructor() {
    this.coursesApi
      .list()
      .pipe(takeUntilDestroyed())
      .subscribe({ next: (courses) => this.courses.set(courses) });

    this.load();
  }

  setCourse(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    this.courseFilter.set(value ? Number(value) : null);
    this.offset.set(0);
    this.load();
  }

  page(step: 1 | -1): void {
    this.offset.update((value) => Math.max(0, value + step * PAGE_SIZE));
    this.load();
  }

  // --- Publicar ---

  openComposer(): void {
    // Si ya se filtró por un curso, se ofrece ese como destino.
    this.composer.patchValue({ courseId: this.courseFilter() });
    this.composing.set(true);
    this.notice.set('');
    this.error.set('');
  }

  closeComposer(): void {
    this.composing.set(false);
    this.composer.reset({ courseId: null, title: '', body: '', notify: true });
  }

  setComposerCourse(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    this.composer.controls.courseId.setValue(value ? Number(value) : null);
  }

  publish(): void {
    this.error.set('');

    const { courseId, title, body, notify } = this.composer.getRawValue();
    const html = textToHtml(body);

    if (this.composer.invalid || courseId === null || !html) {
      this.composer.markAllAsTouched();
      return;
    }

    this.publishing.set(true);

    this.api.create(courseId, { title: title.trim(), body: html, notify }).subscribe({
      next: (created) => {
        this.notice.set(
          notify
            ? `Anuncio publicado. Avisamos a ${created.notified} ${created.notified === 1 ? 'estudiante' : 'estudiantes'}.`
            : 'Anuncio publicado, sin avisar a los estudiantes.',
        );
        this.publishing.set(false);
        this.closeComposer();
        this.offset.set(0);
        this.load();
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos publicar el anuncio.'));
        this.publishing.set(false);
      },
    });
  }

  // --- Editar ---

  edit(item: Announcement): void {
    this.editingId.set(item.id);
    this.editLosesFormat.set(hasRichFormatting(item.body));
    this.editor.reset({ title: item.title, body: htmlToText(item.body) });
    this.confirmDeleteId.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  saveEdit(item: Announcement): void {
    const { title, body } = this.editor.getRawValue();
    const html = textToHtml(body);

    if (this.editor.invalid || !html) {
      this.editor.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');

    this.api.update(item.id, { title: title.trim(), body: html }).subscribe({
      next: (updated) => {
        this.items.update((list) =>
          list.map((entry) => (entry.id === item.id ? { ...entry, ...updated } : entry)),
        );
        this.notice.set('Anuncio actualizado.');
        this.editingId.set(null);
        this.saving.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos guardar el anuncio.'));
        this.saving.set(false);
      },
    });
  }

  // --- Borrar ---

  askDelete(id: number): void {
    this.confirmDeleteId.set(id);
    this.editingId.set(null);
  }

  cancelDelete(): void {
    this.confirmDeleteId.set(null);
  }

  remove(item: Announcement): void {
    this.busyId.set(item.id);
    this.error.set('');

    this.api.remove(item.id).subscribe({
      next: () => {
        this.items.update((list) => list.filter((entry) => entry.id !== item.id));
        this.total.update((value) => Math.max(0, value - 1));
        this.notice.set('Anuncio eliminado.');
        this.confirmDeleteId.set(null);
        this.busyId.set(null);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos eliminar el anuncio.'));
        this.confirmDeleteId.set(null);
        this.busyId.set(null);
      },
    });
  }

  private load(): void {
    this.loading.set(true);

    this.api
      .list({ courseId: this.courseFilter(), limit: PAGE_SIZE, offset: this.offset() })
      .subscribe({
        next: (page) => {
          this.items.set(page.items);
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos cargar los anuncios.'));
          this.loading.set(false);
        },
      });
  }
}
