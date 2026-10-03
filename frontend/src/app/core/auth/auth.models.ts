export interface LoginCredentials {
  identifier: string;
  password: string;
}

export interface LoginSubmission extends LoginCredentials {
  remember: boolean;
}

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface AuthUser {
  firstName: string;
  lastName?: string;
  email: string;
  role?: UserRole;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

/* =========================================
   REGISTRO
   ========================================= */

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  document: string;
  email: string;
  password: string;
}

export interface RegisterResponse {
  id?: string;
  firstName: string;
  lastName: string;
  document: string;
  email: string;
  phone?: string | null;
  role?: string;
  status?: string;
}