import {
  Component,
  inject,
  signal,
} from '@angular/core';

import {
  Router,
  RouterLink,
} from '@angular/router';

import {
  AuthService,
} from '../../../core/auth/auth.service';

@Component({
  selector: 'app-navbar',

  imports: [
    RouterLink,
  ],

  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class Navbar {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly userMenuOpen = signal(false);
  readonly mobileMenuOpen = signal(false);

  toggleUserMenu(): void {
    this.userMenuOpen.update(
      (open) => !open,
    );
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(
      (open) => !open,
    );
  }

  closeMenus(): void {
    this.userMenuOpen.set(false);
    this.mobileMenuOpen.set(false);
  }

  logout(): void {
    this.auth.logout();
    this.closeMenus();
    this.router.navigate(['/']);
  }
}