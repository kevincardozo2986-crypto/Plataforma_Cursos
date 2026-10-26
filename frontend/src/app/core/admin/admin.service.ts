import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'INACTIVE';
export type CourseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: 'Estudiante',
  TEACHER: 'Docente',
  ADMIN: 'Administrador',
};

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  ARCHIVED: 'Archivado',
};

export interface AdminUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  document: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  avatarUrl: string | null;
  /** Cursos que creó. */
  courses: number;
  enrollments: number;
  /** Cursos donde es instructor. */
  instructing: number;
}

export interface UsersPage {
  total: number;
  items: AdminUser[];
}

export interface AdminCourse {
  id: number;
  title: string;
  slug: string;
  status: CourseStatus;
  price: string;
  createdAt: string;
  teacher: { id: number; firstName: string; lastName: string; email: string };
  category: { id: number; name: string } | null;
  enrollments: number;
  modules: number;
}

export interface CoursesPage {
  total: number;
  items: AdminCourse[];
}

export interface Overview {
  users: {
    total: number;
    STUDENT: number;
    TEACHER: number;
    ADMIN: number;
    inactive: number;
    newLast30Days: number;
  };
  courses: { total: number; DRAFT: number; PUBLISHED: number; ARCHIVED: number };
  enrollments: { total: number; completed: number; completionRate: number };
  certificates: { valid: number };
  recentUsers: AdminUser[];
  recentCourses: {
    id: number;
    title: string;
    status: CourseStatus;
    createdAt: string;
    teacher: string;
  }[];
}

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  document: string;
  phone?: string;
  role: UserRole;
  password: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  /** Cursos publicados en la categoría. */
  _count?: { courses: number };
}

export interface UsersQuery {
  q?: string;
  role?: UserRole | '';
  status?: UserStatus | '';
  limit: number;
  offset: number;
}

export interface CoursesQuery {
  q?: string;
  status?: CourseStatus | '';
  limit: number;
  offset: number;
}

function params(query: object): HttpParams {
  let result = new HttpParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      result = result.set(key, String(value).trim());
    }
  }

  return result;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  overview(): Observable<Overview> {
    return this.http.get<Overview>('/api/admin/overview');
  }

  users(query: UsersQuery): Observable<UsersPage> {
    return this.http.get<UsersPage>('/api/admin/users', { params: params(query) });
  }

  createUser(input: CreateUserInput): Observable<AdminUser> {
    return this.http.post<AdminUser>('/api/admin/users', input);
  }

  updateUser(id: number, changes: { role?: UserRole; status?: UserStatus }): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`/api/admin/users/${id}`, changes);
  }

  courses(query: CoursesQuery): Observable<CoursesPage> {
    return this.http.get<CoursesPage>('/api/admin/courses', { params: params(query) });
  }

  setCourseStatus(id: number, status: CourseStatus): Observable<unknown> {
    return this.http.patch(`/api/courses/${id}/status`, { status });
  }

  // --- Categorías ---

  categories(): Observable<Category[]> {
    return this.http.get<Category[]>('/api/categories');
  }

  createCategory(input: { name: string; description?: string }): Observable<Category> {
    return this.http.post<Category>('/api/categories', input);
  }

  updateCategory(id: number, input: { name?: string; description?: string }): Observable<Category> {
    return this.http.patch<Category>(`/api/categories/${id}`, input);
  }

  removeCategory(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`/api/categories/${id}`);
  }
}
