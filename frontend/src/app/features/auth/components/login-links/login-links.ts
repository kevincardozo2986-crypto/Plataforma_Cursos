import { Component, output } from '@angular/core';
@Component({
  selector: 'app-login-links',
  templateUrl: './login-links.html',
  styleUrl: './login-links.scss',
})
export class LoginLinks {
  readonly requested = output<string>();
}
