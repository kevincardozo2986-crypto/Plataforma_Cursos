import { Component, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

export interface RegisterSubmission {
  firstName: string;
  lastName: string;
  document: string;
  email: string;
  password: string;
}

@Component({
  selector: 'app-register-form',
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './register-form.html',
  styleUrl: './register-form.scss',
})
export class RegisterForm {
  readonly submitted = output<RegisterSubmission>();

  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  readonly form = new FormGroup({
    firstName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),

    lastName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),

    document: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[0-9]+$/)],
    }),

    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),

    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)],
    }),

    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),

    terms: new FormControl(false, {
      nonNullable: true,
      validators: [Validators.requiredTrue],
    }),
  });

  get passwordsMatch(): boolean {
    return this.form.controls.password.value === this.form.controls.confirmPassword.value;
  }

  submit(): void {
    this.form.markAllAsTouched();

    if (this.form.invalid || !this.passwordsMatch) {
      return;
    }

    const value = this.form.getRawValue();

    this.submitted.emit({
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      document: value.document.trim(),
      email: value.email.trim().toLowerCase(),
      password: value.password,
    });
  }
}
