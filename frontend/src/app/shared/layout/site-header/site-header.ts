import {
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AccessibilityService } from '../../../core/accessibility/accessibility.service';
import { AuthService } from '../../../core/auth/auth.service';
import { homeFor } from '../../../core/auth/role-home';
import { ProfileService } from '../../../core/profile/profile.service';
import { NotificationBell } from '../notification-bell/notification-bell';
import { headerLinksFor, ROLE_LABELS } from './header-links';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive, NotificationBell],
  templateUrl: './site-header.html',
  styleUrl: './site-header.scss',
})
export class SiteHeader {
  readonly auth = inject(AuthService);
  readonly settings = inject(AccessibilityService);
  private readonly profile = inject(ProfileService);
  private readonly router = inject(Router);

  readonly menuOpen = signal(false);
  readonly accountOpen = signal(false);
  private readonly element = inject(ElementRef);

  @HostListener('document:click', ['$event'])
  closeOutside(event: MouseEvent): void {
    if (!this.element.nativeElement.contains(event.target)) this.accountOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  closeAccount(): void {
    this.accountOpen.set(false);
  }

  openStudentPanel(panel: 'account' | 'notifications'): void {
    this.accountOpen.set(false);
    void this.router.navigate(['/student/dashboard'], { queryParams: { panel } });
  }

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
  readonly homeRoute = computed(() => homeFor(this.auth.user()?.role));

  readonly roleLabel = computed(() => {
    const role = this.auth.user()?.role;

    return role ? ROLE_LABELS[role] : 'Usuario';
  });

  readonly avatarUrl = this.profile.avatarUrl;

  readonly initials = computed(() => {
    const user = this.auth.user();

    if (!user) {
      return '';
    }

    return (user.firstName.charAt(0) + (user.lastName?.charAt(0) ?? '')).toUpperCase();
  });

  constructor() {
    // La foto de perfil: se carga al haber sesión y se limpia al salir.
    effect(() => {
      if (this.auth.user()) {
        this.profile.ensureAvatar();
      } else {
        this.profile.clearAvatar();
      }
    });
  }

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
