import { Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LoginSubmission } from '../../../../core/auth/auth.models';
@Component({
  selector: 'app-login-form',
  imports: [ReactiveFormsModule],
  templateUrl: './login-form.html',
  styleUrl: './login-form.scss',
})
export class LoginForm {
  readonly loading = input(false);
  readonly error = input('');
  readonly submitted = output<LoginSubmission>();
  readonly recoveryRequested = output<void>();
  readonly showPassword = signal(false);
  readonly form = inject(FormBuilder).nonNullable.group({
    identifier: ['', [Validators.required, Validators.pattern(/\S/)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    remember: [false],
  });
  submit() {
    if (this.loading()) return;
    this.form.markAllAsTouched();
    if (this.form.valid) this.submitted.emit(this.form.getRawValue());
  }
}
