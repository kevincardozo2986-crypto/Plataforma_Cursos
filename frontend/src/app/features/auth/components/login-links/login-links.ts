import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Component, output } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  imports: [TranslatePipe, RouterLink],
  selector: 'app-login-links',
  templateUrl: './login-links.html',
  styleUrl: './login-links.scss',
})
export class LoginLinks {
  readonly requested = output<string>();
}
