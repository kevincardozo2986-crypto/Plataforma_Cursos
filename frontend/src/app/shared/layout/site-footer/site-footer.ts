import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { homeFor } from '../../../core/auth/role-home';
@Component({
  selector: 'app-site-footer',
  imports: [TranslatePipe, RouterLink],
  templateUrl: './site-footer.html',
  styleUrl: './site-footer.scss',
})
export class SiteFooter {
  readonly auth = inject(AuthService);
  readonly homeRoute = computed(() => homeFor(this.auth.user()?.role));
  readonly year = new Date().getFullYear();
  backToTop(): void {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
}
