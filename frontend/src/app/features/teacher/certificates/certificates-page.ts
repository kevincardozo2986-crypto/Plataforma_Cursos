import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import {
  CertificateStatus,
  CertificateTemplate,
  IssuedCertificate,
  LAYOUT_LABELS,
} from '../../../core/certificates/certificates.models';
import { CertificatesService } from '../../../core/certificates/certificates.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { downloadBlob, openBlob } from '../../../core/utils/download';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { TeacherCourse } from '../courses/teacher-courses.models';
import { TeacherCoursesService } from '../courses/teacher-courses.service';

type Tab = 'templates' | 'issued';

const PAGE_SIZE = 20;

/** Certificados del docente: sus plantillas y los certificados ya emitidos en sus cursos. */
@Component({
  selector: 'app-certificates-page',
  imports: [RouterLink, DatePipe, PageHeader],
  templateUrl: './certificates-page.html',
  styleUrl: './certificates-page.scss',
})
export class CertificatesPage {
  private readonly api = inject(CertificatesService);
  private readonly coursesApi = inject(TeacherCoursesService);

  readonly layoutLabels = LAYOUT_LABELS;

  readonly tab = signal<Tab>('templates');
  readonly error = signal('');
  readonly notice = signal('');

  // --- Plantillas ---
  readonly templates = signal<CertificateTemplate[]>([]);
  readonly loadingTemplates = signal(true);
  readonly confirmDeleteId = signal<number | null>(null);
  readonly busyId = signal<number | null>(null);

  // --- Emitidos ---
  readonly issued = signal<IssuedCertificate[]>([]);
  readonly total = signal(0);
  readonly loadingIssued = signal(false);
  readonly courses = signal<TeacherCourse[]>([]);
  readonly courseFilter = signal<number | null>(null);
  readonly statusFilter = signal<CertificateStatus | null>(null);
  readonly offset = signal(0);
  readonly confirmRevokeId = signal<number | null>(null);

  readonly from = computed(() => (this.total() === 0 ? 0 : this.offset() + 1));
  readonly to = computed(() => Math.min(this.offset() + PAGE_SIZE, this.total()));
  readonly hasPrev = computed(() => this.offset() > 0);
  readonly hasNext = computed(() => this.offset() + PAGE_SIZE < this.total());

  constructor() {
    this.api
      .templates()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (templates) => {
          this.templates.set(templates);
          this.loadingTemplates.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos cargar tus plantillas.'));
          this.loadingTemplates.set(false);
        },
      });

    this.coursesApi
      .list()
      .pipe(takeUntilDestroyed())
      .subscribe({ next: (courses) => this.courses.set(courses) });
  }

  show(tab: Tab): void {
    this.tab.set(tab);
    this.error.set('');
    this.notice.set('');

    if (tab === 'issued' && this.issued().length === 0 && !this.loadingIssued()) {
      this.loadIssued();
    }
  }

  // --- Plantillas ---

  preview(template: CertificateTemplate): void {
    this.begin(template.id);

    this.api.preview(template.id).subscribe({
      next: (blob) => {
        openBlob(blob);
        this.busyId.set(null);
      },
      error: (error: unknown) => this.fail(error, 'No pudimos generar la vista previa.'),
    });
  }

  askDelete(id: number): void {
    this.confirmDeleteId.set(id);
  }

  cancelDelete(): void {
    this.confirmDeleteId.set(null);
  }

  remove(template: CertificateTemplate): void {
    this.begin(template.id);

    this.api.removeTemplate(template.id).subscribe({
      next: () => {
        this.templates.update((list) => list.filter((item) => item.id !== template.id));
        this.notice.set(`Se eliminó la plantilla «${template.name}».`);
        this.confirmDeleteId.set(null);
        this.busyId.set(null);
      },
      error: (error: unknown) => {
        // El backend explica si algún curso todavía la usa.
        this.confirmDeleteId.set(null);
        this.fail(error, 'No pudimos eliminar la plantilla.');
      },
    });
  }

  // --- Emitidos ---

  setCourse(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    this.courseFilter.set(value ? Number(value) : null);
    this.offset.set(0);
    this.loadIssued();
  }

  setStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as CertificateStatus | '';

    this.statusFilter.set(value || null);
    this.offset.set(0);
    this.loadIssued();
  }

  page(step: 1 | -1): void {
    this.offset.update((value) => Math.max(0, value + step * PAGE_SIZE));
    this.loadIssued();
  }

  download(certificate: IssuedCertificate): void {
    this.begin(certificate.id);

    this.api.pdf(certificate.id).subscribe({
      next: (blob) => {
        downloadBlob(blob, `certificado-${certificate.code}.pdf`);
        this.busyId.set(null);
      },
      error: (error: unknown) => this.fail(error, 'No pudimos descargar el certificado.'),
    });
  }

  askRevoke(id: number): void {
    this.confirmRevokeId.set(id);
  }

  cancelRevoke(): void {
    this.confirmRevokeId.set(null);
  }

  revoke(certificate: IssuedCertificate): void {
    this.begin(certificate.id);

    this.api.revoke(certificate.id).subscribe({
      next: (updated) => {
        this.issued.update((list) =>
          list.map((item) =>
            item.id === certificate.id
              ? { ...item, status: updated.status, revokedAt: updated.revokedAt }
              : item,
          ),
        );
        this.notice.set(`Se revocó el certificado de ${certificate.studentName}.`);
        this.confirmRevokeId.set(null);
        this.busyId.set(null);
      },
      error: (error: unknown) => {
        this.confirmRevokeId.set(null);
        this.fail(error, 'No pudimos revocar el certificado.');
      },
    });
  }

  private loadIssued(): void {
    this.loadingIssued.set(true);
    this.error.set('');

    this.api
      .issued({
        courseId: this.courseFilter(),
        status: this.statusFilter(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      })
      .subscribe({
        next: (page) => {
          this.issued.set(page.items);
          this.total.set(page.total);
          this.loadingIssued.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos cargar los certificados emitidos.'));
          this.loadingIssued.set(false);
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
}
