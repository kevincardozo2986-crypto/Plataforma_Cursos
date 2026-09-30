export interface LoginCredentials {
  identifier: string;
  password: string;
}
export interface LoginSubmission extends LoginCredentials {
  remember: boolean;
}
export interface AuthUser {
  firstName: string;
  email: string;
}
export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}
