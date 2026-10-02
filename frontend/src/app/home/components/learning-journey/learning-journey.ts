import {
  Component,
  computed,
  inject,
} from '@angular/core';

import {
  RouterLink,
} from '@angular/router';

import {
  AuthService,
} from '../../../core/auth/auth.service';

@Component({
  selector: 'app-learning-journey',
  imports: [
    RouterLink,
  ],
  templateUrl: './learning-journey.html',
  styleUrl: './learning-journey.scss',
})
export class LearningJourney {
  private readonly authService =
    inject(AuthService);

  readonly user =
    this.authService.user;

  readonly isAuthenticated =
    computed(() => !!this.user());

  readonly firstName =
    computed(() => this.user()?.firstName ?? '');
}