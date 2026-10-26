import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import {
  AdminService,
  AdminUser,
  ROLE_LABELS,
  UserRole,
  UserStatus,
} from '../../../core/admin/admin.service';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { Icon } from '../../../shared/ui/icon/icon';

const PAGE_SIZE = 20;

/** Una contraseña inicial de 12 caracteres que no confunde letras con números (sin 0, O, 1, l, I). */
export function generatePassword(length = 12): string {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const random = crypto.getRandomValues(new Uint32Array(length));

  return Array.from(random, (value) => chars[value % chars.length]).join('') + '*';
}

/** Cuentas de la plataforma: buscar, crear, cambiar el rol y activar o desactivar el acceso. */
@Component({
  selector: 'app-admin-users',
  imports: [DatePipe, FormsModule, Icon],
  templateUrl: './users-page.html',
  styleUrls: ['../admin-common.scss', './users-page.scss'],
})
export class UsersPage {
  private readonly api = inject(AdminService);
  private readonly auth = inject(AuthService);

  readonly roleLabels = ROLE_LABELS;
  readonly roles: UserRole[] = ['STUDENT', 'TEACHER', 'ADMIN'];
  readonly pageSize = PAGE_SIZE;

  readonly users = signal<AdminUser[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busyId = signal<number | null>(null);

  readonly q = signal('');
  readonly role = signal<UserRole | ''>('');
  readonly status = signal<UserStatus | ''>('');
  readonly offset = signal(0);

  /** Un cambio que espera confirmación: «cambiar a rol X» o «desactivar». */
  readonly pending = signal<{ id: number; role?: UserRole; status?: UserStatus } | null>(null);

  // Crear una cuenta
  readonly creating = signal(false);
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly form = signal({
    firstName: '',
    lastName: '',
    email: '',
    document: '',
    phone: '',
    role: 'TEACHER' as UserRole,
    password: '',
  });
  readonly showPassword = signal(false);

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
      .users({
        q: this.q(),
        role: this.role(),
        status: this.status(),
        limit: PAGE_SIZE,
        offset: this.offset(),
      })
      .subscribe({
        next: (page) => {
          this.users.set(page.items);
          this.total.set(page.total);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos cargar las cuentas.'));
          this.loading.set(false);
        },
      });
  }

  // ---------- Filtros ----------

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

  setRole(event: Event): void {
    this.role.set((event.target as HTMLSelectElement).value as UserRole | '');
    this.offset.set(0);
    this.load();
  }

  setStatus(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value as UserStatus | '');
    this.offset.set(0);
    this.load();
  }

  page(step: 1 | -1): void {
    this.offset.update((value) => Math.max(0, value + step * PAGE_SIZE));
    this.load();
  }

  // ---------- Utilidades ----------

  initials(user: AdminUser): string {
    return ((user.firstName[0] ?? '') + (user.lastName[0] ?? '')).toUpperCase();
  }

  /** La sesión guarda el correo, no el id. */
  isMe(user: AdminUser): boolean {
    return user.email.toLowerCase() === (this.auth.user()?.email ?? '').toLowerCase();
  }

  // ---------- Cambiar rol o estado ----------

  askRole(user: AdminUser, event: Event): void {
    const role = (event.target as HTMLSelectElement).value as UserRole;

    // El selector vuelve a mostrar el rol real hasta que se confirme.
    (event.target as HTMLSelectElement).value = user.role;

    if (role !== user.role) {
      this.pending.set({ id: user.id, role });
    }
  }

  askStatus(user: AdminUser): void {
    this.pending.set({ id: user.id, status: user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
  }

  cancel(): void {
    this.pending.set(null);
  }

  confirm(user: AdminUser): void {
    const change = this.pending();

    if (!change) {
      return;
    }

    this.notice.set('');
    this.error.set('');
    this.busyId.set(user.id);

    this.api.updateUser(user.id, { role: change.role, status: change.status }).subscribe({
      next: (updated) => {
        this.users.update((list) => list.map((item) => (item.id === updated.id ? updated : item)));
        this.notice.set(
          change.role
            ? `${updated.firstName} ahora es ${ROLE_LABELS[updated.role].toLowerCase()}.`
            : updated.status === 'ACTIVE'
              ? `${updated.firstName} ya puede entrar de nuevo.`
              : `${updated.firstName} quedó sin acceso y se cerraron sus sesiones.`,
        );
        this.pending.set(null);
        this.busyId.set(null);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos guardar el cambio.'));
        this.pending.set(null);
        this.busyId.set(null);
      },
    });
  }

  // ---------- Crear una cuenta ----------

  openCreate(): void {
    this.creating.set(true);
    this.formError.set('');
    this.form.update((form) => ({ ...form, password: generatePassword() }));
    this.showPassword.set(true);
  }

  closeCreate(): void {
    this.creating.set(false);
  }

  patch(field: keyof ReturnType<typeof this.form>, value: string): void {
    this.form.update((form) => ({ ...form, [field]: value }));
  }

  regenerate(): void {
    this.form.update((form) => ({ ...form, password: generatePassword() }));
    this.showPassword.set(true);
  }

  create(): void {
    const form = this.form();

    this.formError.set('');

    if (form.firstName.trim().length < 2 || form.lastName.trim().length < 2) {
      this.formError.set('Escribe el nombre y el apellido (mínimo 2 letras cada uno).');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      this.formError.set('Escribe un correo válido.');
      return;
    }
    if (form.document.trim().length < 4) {
      this.formError.set('El documento debe tener mínimo 4 caracteres.');
      return;
    }
    if (form.password.length < 8) {
      this.formError.set('La contraseña debe tener mínimo 8 caracteres.');
      return;
    }

    this.saving.set(true);

    this.api
      .createUser({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        document: form.document.trim(),
        phone: form.phone.trim() || undefined,
        role: form.role,
        password: form.password,
      })
      .subscribe({
        next: (created) => {
          this.saving.set(false);
          this.creating.set(false);
          this.form.set({
            firstName: '',
            lastName: '',
            email: '',
            document: '',
            phone: '',
            role: 'TEACHER',
            password: '',
          });
          this.notice.set(
            `Cuenta creada para ${created.firstName} ${created.lastName} (${ROLE_LABELS[created.role].toLowerCase()}). Comparte con la persona su contraseña inicial.`,
          );
          this.offset.set(0);
          this.load();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.formError.set(apiErrorMessage(error, 'No pudimos crear la cuenta.'));
        },
      });
  }
}
