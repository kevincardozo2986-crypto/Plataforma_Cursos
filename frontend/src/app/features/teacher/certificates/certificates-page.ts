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
import { Icon } from '../../../shared/ui/icon/icon';
import { TeacherCourse } from '../courses/teacher-courses.models';
import { CertificatePreview } from './certificate-preview';
import { TeacherCoursesService } from '../courses/teacher-courses.service';

type Tab = 'templates' | 'issued';

const PAGE_SIZE = 20;

/** Certificados del docente: sus plantillas y los certificados ya emitidos en sus cursos. */
@Component({
  selector: 'app-certificates-page',
  imports: [RouterLink, DatePipe, Icon, CertificatePreview],
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
  readonly confirmRefreshId = signal<number | null>(null);

  /** Certificado cuyo nombre y cédula se están corrigiendo. */
  readonly editId = signal<number | null>(null);
  readonly editName = signal('');
  readonly editDocument = signal('');
  readonly editError = signal('');

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

  /** Las iniciales para el círculo junto al nombre. */
  initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);

    return (
      (words[0]?.[0] ?? '') + (words.length > 1 ? (words[words.length - 1][0] ?? '') : '')
    ).toUpperCase();
  }

  startEdit(item: IssuedCertificate): void {
    this.editId.set(item.id);
    this.editName.set(item.studentName);
    this.editDocument.set(item.studentDocument ?? '');
    this.editError.set('');
    this.confirmRevokeId.set(null);
    this.confirmRefreshId.set(null);
  }

  cancelEdit(): void {
    this.editId.set(null);
  }

  saveEdit(item: IssuedCertificate): void {
    const name = this.editName().trim();
    const document = this.editDocument().trim();

    if (name.length < 2) {
      this.editError.set('El nombre debe tener mínimo 2 caracteres.');
      return;
    }
    if (document !== '' && document.length < 4) {
      this.editError.set(
        'El documento debe tener mínimo 4 caracteres (o déjalo vacío para quitarlo).',
      );
      return;
    }

    const changes: { studentName?: string; studentDocument?: string } = {};

    if (name !== item.studentName) changes.studentName = name;
    if (document !== (item.studentDocument ?? '')) changes.studentDocument = document;

    if (Object.keys(changes).length === 0) {
      this.editId.set(null);
      return;
    }

    this.begin(item.id);

    this.api.edit(item.id, changes).subscribe({
      next: (updated) => {
        this.replace(item.id, {
          studentName: updated.studentName,
          studentDocument: updated.studentDocument,
        });
        this.notice.set('Datos del certificado corregidos. El código sigue siendo el mismo.');
        this.editId.set(null);
        this.busyId.set(null);
      },
      error: (error: unknown) => {
        this.editError.set(apiErrorMessage(error, 'No pudimos corregir el certificado.'));
        this.busyId.set(null);
      },
    });
  }

  askRefresh(id: number): void {
    this.confirmRefreshId.set(id);
    this.confirmRevokeId.set(null);
  }

  cancelRefresh(): void {
    this.confirmRefreshId.set(null);
  }

  refresh(item: IssuedCertificate): void {
    this.begin(item.id);

    this.api.refresh(item.id).subscribe({
      next: (updated) => {
        this.replace(item.id, { courseTitle: updated.courseTitle });
        this.notice.set(
          `El certificado de ${item.studentName} se actualizó con el diseño actual del curso.`,
        );
        this.confirmRefreshId.set(null);
        this.busyId.set(null);
      },
      error: (error: unknown) => {
        this.confirmRefreshId.set(null);
        this.fail(error, 'No pudimos actualizar el certificado.');
      },
    });
  }

  private replace(id: number, changes: Partial<IssuedCertificate>): void {
    this.issued.update((list) =>
      list.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
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
