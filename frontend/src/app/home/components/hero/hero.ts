import {
  Component,
  inject,
} from '@angular/core';

import {
  RouterLink,
} from '@angular/router';

import {
  AuthService,
} from '../../../core/auth/auth.service';

@Component({
  selector: 'app-hero',

  imports: [
    RouterLink,
  ],

  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {
  readonly auth = inject(AuthService);
}