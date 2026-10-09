import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

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
  facebookUrl?: string | null;
  xUrl?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  get(): Observable<ProfileData> {
    return this.http.get<ProfileData>('/api/profile');
  }

  update(input: ProfileUpdate): Observable<ProfileData> {
    return this.http.patch<ProfileData>('/api/profile', input);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ changed: boolean }> {
    return this.http.patch<{ changed: boolean }>('/api/profile/password', {
      currentPassword,
      newPassword,
    });
  }
}
