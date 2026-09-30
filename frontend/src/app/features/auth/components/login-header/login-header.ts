import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Component } from '@angular/core';

@Component({
  imports: [TranslatePipe],
  selector: 'app-login-header',
  templateUrl: './login-header.html',
  styleUrl: './login-header.scss',
})
export class LoginHeader {}
