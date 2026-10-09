import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';

import { apiErrorMessage } from '../../../core/http/api-error';
import { ProfileData, ProfileService, ProfileUpdate } from '../../../core/profile/profile.service';
import { validateFile } from '../../../core/uploads/upload-rules';
import { UploadsService } from '../../../core/uploads/uploads.service';
import { PageHeader } from '../../../shared/ui/page-header/page-header';

const URL_PATTERN = /^https?:\/\/\S+$/i;

/** Zonas horarias que ofrece el navegador; si no las expone, una lista corta. */
function timezones(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.('timeZone');

  return supported?.length
    ? supported
    : [
        'America/Bogota',
        'America/Mexico_City',
        'America/Lima',
        'America/Santiago',
        'America/Argentina/Buenos_Aires',
        'America/New_York',
        'Europe/Madrid',
        'UTC',
      ];
}

/** Texto vacío = borrar el dato (null). */
const orNull = (value: string): string | null => value.trim() || null;

const optionalUrl = () =>
  new FormControl('', {
    nonNullable: true,
    validators: [Validators.pattern(URL_PATTERN), Validators.maxLength(300)],
  });

/** Perfil del docente: cuenta, nombre público, redes, firma de los certificados y contraseña. */
@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule, PageHeader],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  private readonly api = inject(ProfileService);
  private readonly uploads = inject(UploadsService);

  readonly zones = timezones();

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly data = signal<ProfileData | null>(null);

  // Firma
  readonly signatureUrl = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly percent = signal(0);
  readonly signatureError = signal('');
  private upload: Subscription | null = null;

  // Contraseña
  readonly savingPassword = signal(false);
  readonly passwordError = signal('');
  readonly passwordNotice = signal('');

  readonly isTeacher = computed(() => this.data()?.account.role !== 'STUDENT');

  readonly form = new FormGroup({
    firstName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(50)],
    }),
    lastName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(50)],
    }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(30)] }),
    occupation: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
    timezone: new FormControl('America/Bogota', { nonNullable: true }),
    publicName: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
    bio: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
    facebookUrl: optionalUrl(),
    xUrl: optionalUrl(),
    linkedinUrl: optionalUrl(),
    githubUrl: optionalUrl(),
    websiteUrl: optionalUrl(),
  });

  readonly socials: {
    control: 'facebookUrl' | 'xUrl' | 'linkedinUrl' | 'githubUrl' | 'websiteUrl';
    label: string;
    placeholder: string;
  }[] = [
    { control: 'facebookUrl', label: 'Facebook', placeholder: 'https://facebook.com/tu-usuario' },
    { control: 'xUrl', label: 'X (Twitter)', placeholder: 'https://x.com/tu-usuario' },
    {
      control: 'linkedinUrl',
      label: 'LinkedIn',
      placeholder: 'https://linkedin.com/in/tu-usuario',
    },
    { control: 'githubUrl', label: 'GitHub', placeholder: 'https://github.com/tu-usuario' },
    { control: 'websiteUrl', label: 'Sitio web', placeholder: 'https://tu-sitio.com' },
  ];

  readonly passwordForm = new FormGroup({
    currentPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    newPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8), Validators.maxLength(72)],
    }),
    repeat: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.upload?.unsubscribe());

    this.api
      .get()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (data) => {
          this.apply(data);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error, 'No pudimos cargar tu perfil.'));
          this.loading.set(false);
        },
      });
  }

  save(): void {
    this.error.set('');
    this.notice.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos marcados.');
      return;
    }

    const v = this.form.getRawValue();

    this.send(
      {
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim(),
        phone: orNull(v.phone),
        occupation: orNull(v.occupation),
        timezone: v.timezone,
        publicName: orNull(v.publicName),
        bio: orNull(v.bio),
        facebookUrl: orNull(v.facebookUrl),
        xUrl: orNull(v.xUrl),
        linkedinUrl: orNull(v.linkedinUrl),
        githubUrl: orNull(v.githubUrl),
        websiteUrl: orNull(v.websiteUrl),
      },
      'Perfil guardado.',
    );
  }

  // --- Firma ---

  onSignature(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (!file) {
      return;
    }

    const problem = validateFile('image', file);

    if (problem) {
      this.signatureError.set(problem);
      return;
    }

    this.signatureError.set('');
    this.uploading.set(true);
    this.percent.set(0);

    this.upload?.unsubscribe();
    this.upload = this.uploads.upload('image', file).subscribe({
      next: (event) => {
        if (event.type === 'progress') {
          this.percent.set(event.percent);
          return;
        }

        this.uploading.set(false);
        this.send({ signatureUrl: event.url }, 'Firma guardada.', () =>
          this.signatureError.set(''),
        );
      },
      error: (error: Error) => {
        this.signatureError.set(error.message);
        this.uploading.set(false);
      },
    });
  }

  removeSignature(): void {
    this.send({ signatureUrl: null }, 'Firma eliminada.');
  }

  // --- Contraseña ---

  passwordsMatch(): boolean {
    const { newPassword, repeat } = this.passwordForm.getRawValue();

    return newPassword === repeat;
  }

  changePassword(): void {
    this.passwordError.set('');
    this.passwordNotice.set('');

    if (this.passwordForm.invalid || !this.passwordsMatch()) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword } = this.passwordForm.getRawValue();

    this.savingPassword.set(true);

    this.api.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.passwordForm.reset();
        this.passwordNotice.set('Contraseña actualizada.');
        this.savingPassword.set(false);
      },
      error: (error: unknown) => {
        this.passwordError.set(apiErrorMessage(error, 'No pudimos cambiar la contraseña.'));
        this.savingPassword.set(false);
      },
    });
  }

  fieldInvalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];

    return control.touched && control.invalid;
  }

  private send(update: ProfileUpdate, success: string, onSuccess?: () => void): void {
    this.saving.set(true);

    this.api.update(update).subscribe({
      next: (data) => {
        this.apply(data);
        this.notice.set(success);
        this.saving.set(false);
        onSuccess?.();
      },
      error: (error: unknown) => {
        this.error.set(apiErrorMessage(error, 'No pudimos guardar los cambios.'));
        this.saving.set(false);
      },
    });
  }

  private apply(data: ProfileData): void {
    const { account, profile } = data;

    this.data.set(data);
    this.signatureUrl.set(profile.signatureUrl);
    this.form.reset({
      firstName: account.firstName,
      lastName: account.lastName,
      phone: account.phone ?? '',
      occupation: profile.occupation ?? '',
      timezone: profile.timezone,
      publicName: profile.publicName ?? '',
      bio: profile.bio ?? '',
      facebookUrl: profile.social.facebookUrl ?? '',
      xUrl: profile.social.xUrl ?? '',
      linkedinUrl: profile.social.linkedinUrl ?? '',
      githubUrl: profile.social.githubUrl ?? '',
      websiteUrl: profile.social.websiteUrl ?? '',
    });
  }
}
