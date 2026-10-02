import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AccessibilityService } from '../../../core/accessibility/accessibility.service';
import { AuthService } from '../../../core/auth/auth.service';
import { headerLinksFor, ROLE_LABELS } from './header-links';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './site-header.html',
  styleUrl: './site-header.scss',
})
export class SiteHeader {
  readonly auth = inject(AuthService);
  readonly settings = inject(AccessibilityService);
  private readonly router = inject(Router);

  readonly menuOpen = signal(false);

  /** "Inicio" solo se marca activo sin fragmento; "Cursos", solo con #courses. */
  readonly matchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'exact',
  } as const;

  /** Para enlaces con subrutas: activo también en /teacher/courses/new, etc. */
  readonly prefixMatchOptions = {
    paths: 'subset',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  } as const;

  readonly links = computed(() => headerLinksFor(this.auth.user()?.role ?? null));

  readonly roleLabel = computed(() => {
    const role = this.auth.user()?.role;

    return role ? ROLE_LABELS[role] : 'Usuario';
  });

  readonly initials = computed(() => {
    const user = this.auth.user();

    if (!user) {
      return '';
    }

    return (user.firstName.charAt(0) + (user.lastName?.charAt(0) ?? '')).toUpperCase();
  });

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  toggleDark(): void {
    this.settings.darkMode.update((dark) => !dark);
  }

  logout(): void {
    this.auth.logout();
    this.closeMenu();
    void this.router.navigate(['/']);
  }
}
