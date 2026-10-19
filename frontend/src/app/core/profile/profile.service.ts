import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

export interface SocialLinks {
  facebookUrl: string | null;
  xUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
}

export interface ProfileData {
  account: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    role: 'STUDENT' | 'TEACHER' | 'ADMIN';
    createdAt: string;
  };
  profile: {
    occupation: string | null;
    timezone: string;
    publicName: string | null;
    bio: string | null;
    signatureUrl: string | null;
    avatarUrl: string | null;
    social: SocialLinks;
  };
  preferences: {
    autoplayNext: boolean;
    reduceMotion: boolean;
    theme: 'LIGHT' | 'DARK' | 'SYSTEM';
    fontSize: 'SMALL' | 'MEDIUM' | 'LARGE';
    highContrast: boolean;
    colorFilter: 'NONE' | 'PROTANOPIA' | 'DEUTERANOPIA' | 'TRITANOPIA' | 'GRAYSCALE';
  };
  /** Solo para docentes. */
  stats: {
    courses: number;
    students: number;
    rating: { average: number | null; count: number };
  } | null;
}

/** Cuerpo de PATCH /profile: lo que no se envía no se toca; null borra los datos opcionales. */
export interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  occupation?: string | null;
  timezone?: string;
  publicName?: string | null;
  bio?: string | null;
  signatureUrl?: string | null;
  avatarUrl?: string | null;
  facebookUrl?: string | null;
  xUrl?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  /** La foto de perfil de quien tiene la sesión; la usa el encabezado y la actualiza esta página. */
  readonly avatarUrl = signal<string | null>(null);
  private avatarLoaded = false;

  get(): Observable<ProfileData> {
    return this.http.get<ProfileData>('/api/profile').pipe(tap((data) => this.remember(data)));
  }

  update(input: ProfileUpdate): Observable<ProfileData> {
    return this.http
      .patch<ProfileData>('/api/profile', input)
      .pipe(tap((data) => this.remember(data)));
  }

  /** Carga la foto una sola vez por sesión (para el encabezado). */
  ensureAvatar(): void {
    if (this.avatarLoaded) {
      return;
    }

    this.avatarLoaded = true;
    this.get().subscribe({ error: () => (this.avatarLoaded = false) });
  }

  /** Al cerrar sesión. */
  clearAvatar(): void {
    this.avatarLoaded = false;
    this.avatarUrl.set(null);
  }

  private remember(data: ProfileData): void {
    this.avatarLoaded = true;
    this.avatarUrl.set(data.profile.avatarUrl);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ changed: boolean }> {
    return this.http.patch<{ changed: boolean }>('/api/profile/password', {
      currentPassword,
      newPassword,
    });
  }
}
