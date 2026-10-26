import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminService, Category } from '../../../core/admin/admin.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { Icon } from '../../../shared/ui/icon/icon';

/** Las categorías con las que se agrupan los cursos en el catálogo: crear, renombrar y borrar. */
@Component({
  selector: 'app-admin-categories',
  imports: [FormsModule, Icon],
  templateUrl: './categories-page.html',
  styleUrls: ['../admin-common.scss', './categories-page.scss'],
})
export class CategoriesPage {
  private readonly api = inject(AdminService);

  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal(false);

  // Nueva
  readonly newName = signal('');
  readonly newDescription = signal('');

  // Edición en la fila
  readonly editId = signal<number | null>(null);
  readonly editName = signal('');
  readonly editDescription = signal('');
  readonly confirmId = signal<number | null>(null);

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.categories().subscribe({
      next: (list) => {
        this.categories.set(list);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos cargar las categorías.'));
        this.loading.set(false);
      },
    });
  }

  add(): void {
    const name = this.newName().trim();

    this.error.set('');
    this.notice.set('');

    if (name.length < 2) {
      this.error.set('El nombre debe tener mínimo 2 caracteres.');
      return;
    }

    this.busy.set(true);

    this.api
      .createCategory({ name, description: this.newDescription().trim() || undefined })
      .subscribe({
        next: () => {
          this.newName.set('');
          this.newDescription.set('');
          this.notice.set(`Se creó la categoría «${name}».`);
          this.busy.set(false);
          this.load();
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos crear la categoría.'));
          this.busy.set(false);
        },
      });
  }

  startEdit(category: Category): void {
    this.editId.set(category.id);
    this.editName.set(category.name);
    this.editDescription.set(category.description ?? '');
    this.confirmId.set(null);
  }

  cancelEdit(): void {
    this.editId.set(null);
  }

  saveEdit(category: Category): void {
    const name = this.editName().trim();

    this.error.set('');
    this.notice.set('');

    if (name.length < 2) {
      this.error.set('El nombre debe tener mínimo 2 caracteres.');
      return;
    }

    this.busy.set(true);

    this.api
      .updateCategory(category.id, { name, description: this.editDescription().trim() })
      .subscribe({
        next: () => {
          this.editId.set(null);
          this.notice.set('Categoría actualizada.');
          this.busy.set(false);
          this.load();
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos guardar la categoría.'));
          this.busy.set(false);
        },
      });
  }

  remove(category: Category): void {
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);

    this.api.removeCategory(category.id).subscribe({
      next: () => {
        this.confirmId.set(null);
        this.notice.set(`Se borró «${category.name}». Sus cursos quedaron sin categoría.`);
        this.busy.set(false);
        this.load();
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos borrar la categoría.'));
        this.confirmId.set(null);
        this.busy.set(false);
      },
    });
  }
}
