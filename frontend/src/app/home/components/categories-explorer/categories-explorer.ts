
import {
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';

import {
  takeUntilDestroyed,
} from '@angular/core/rxjs-interop';

import {
  CategoriesService,
} from '../../../core/categories/categories.service';

import {
  Category,
} from '../../../core/categories/categories.models';

@Component({
  selector: 'app-categories-explorer',
  imports: [],
  templateUrl: './categories-explorer.html',
  styleUrl: './categories-explorer.scss',
})
export class CategoriesExplorer {
  private readonly categoriesService =
    inject(CategoriesService);

  private readonly destroyRef =
    inject(DestroyRef);

  readonly categories =
    signal<Category[]>([]);

  readonly loading =
    signal(true);

  readonly error =
    signal('');

  readonly activeCategory =
    signal<string | null>(null);

  constructor() {
    this.loadCategories();
  }

  private loadCategories(): void {
    this.loading.set(true);
    this.error.set('');

    this.categoriesService
      .getCategories()
      .pipe(
        takeUntilDestroyed(
          this.destroyRef,
        ),
      )
      .subscribe({
        next: (categories) => {
          this.categories.set(
            categories,
          );

          this.loading.set(false);
        },

        error: () => {
          this.error.set(
            'No pudimos cargar las áreas de conocimiento.',
          );

          this.loading.set(false);
        },
      });
  }

  selectCategory(
    category: Category,
  ): void {
    const current =
      this.activeCategory();

    this.activeCategory.set(
      current === category.id
        ? null
        : category.id,
    );
  }
}