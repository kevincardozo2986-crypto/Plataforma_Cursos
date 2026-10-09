import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { Verification } from '../../core/certificates/certificates.models';
import { CertificatesService } from '../../core/certificates/certificates.service';
import { formatDuration } from '../../core/utils/format-duration';

/** Página pública (sin sesión) para comprobar un certificado con su código. */
@Component({
  selector: 'app-verify-page',
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './verify-page.html',
  styleUrl: './verify-page.scss',
})
export class VerifyPage {
  private readonly api = inject(CertificatesService);
  private readonly router = inject(Router);

  readonly code = new FormControl(inject(ActivatedRoute).snapshot.paramMap.get('code') ?? '', {
    nonNullable: true,
  });

  readonly loading = signal(false);
  readonly result = signal<Verification | null>(null);
  readonly notFound = signal(false);
  readonly failed = signal(false);

  readonly formatDuration = formatDuration;

  constructor() {
    if (this.code.value.trim()) {
      this.check();
    }
  }

  submit(): void {
    const code = this.code.value.trim();

    if (!code) {
      return;
    }

    // La dirección queda compartible: /verificar/CC-XXXX-XXXX-XXXX.
    void this.router.navigate(['/verificar', code.toUpperCase()], { replaceUrl: true });
    this.check();
  }

  private check(): void {
    const code = this.code.value.trim();

    this.result.set(null);
    this.notFound.set(false);
    this.failed.set(false);
    this.loading.set(true);

    this.api.verify(code).subscribe({
      next: (result) => {
        this.result.set(result);
        this.loading.set(false);
      },
      error: (error: { status?: number }) => {
        // 404 = no existe; cualquier otra cosa es un problema de conexión.
        this.notFound.set(error.status === 404);
        this.failed.set(error.status !== 404);
        this.loading.set(false);
      },
    });
  }
}
