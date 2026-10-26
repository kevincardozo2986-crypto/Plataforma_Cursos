import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AdminService,
  COURSE_STATUS_LABELS,
  Overview,
  ROLE_LABELS,
  UserRole,
} from '../../../core/admin/admin.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { Icon } from '../../../shared/ui/icon/icon';

const number = new Intl.NumberFormat('es-CO');

/** Las cifras de toda la plataforma y lo más reciente. */
@Component({
  selector: 'app-admin-overview',
  imports: [DatePipe, RouterLink, Icon],
  templateUrl: './overview-page.html',
  styleUrls: ['../admin-common.scss', './overview-page.scss'],
})
export class OverviewPage {
  private readonly api = inject(AdminService);

  readonly roleLabels = ROLE_LABELS;
  readonly statusLabels = COURSE_STATUS_LABELS;
  readonly fmt = (value: number): string => number.format(value);

  readonly data = signal<Overview | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly roles = computed(() => {
    const users = this.data()?.users;

    if (!users) {
      return [];
    }

    const total = Math.max(1, users.total);

    return (['STUDENT', 'TEACHER', 'ADMIN'] as UserRole[]).map((role) => ({
      role,
      count: users[role],
      percent: Math.round((users[role] / total) * 100),
    }));
  });

  readonly tiles = computed(() => {
    const data = this.data();

    if (!data) {
      return [];
    }

    return [
      {
        icon: 'users' as const,
        tone: 'blue',
        label: 'Usuarios',
        value: number.format(data.users.total),
        note: `${number.format(data.users.newLast30Days)} nuevos en 30 días`,
      },
      {
        icon: 'book' as const,
        tone: 'teal',
        label: 'Cursos',
        value: number.format(data.courses.total),
        note: `${number.format(data.courses.PUBLISHED)} publicados`,
      },
      {
        icon: 'clipboard' as const,
        tone: 'orange',
        label: 'Inscripciones',
        value: number.format(data.enrollments.total),
        note: `${data.enrollments.completionRate}% terminadas`,
      },
      {
        icon: 'award' as const,
        tone: 'violet',
        label: 'Certificados',
        value: number.format(data.certificates.valid),
        note: 'vigentes',
      },
      {
        icon: 'lock' as const,
        tone: 'amber',
        label: 'Cuentas inactivas',
        value: number.format(data.users.inactive),
        note: 'sin acceso',
      },
    ];
  });

  constructor() {
    this.api.overview().subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos cargar el resumen.'));
        this.loading.set(false);
      },
    });
  }

  initials(user: { firstName: string; lastName: string }): string {
    return ((user.firstName[0] ?? '') + (user.lastName[0] ?? '')).toUpperCase();
  }

  tone(status: string): string {
    return status === 'PUBLISHED' ? 'ok' : status === 'DRAFT' ? 'warn' : '';
  }
}
