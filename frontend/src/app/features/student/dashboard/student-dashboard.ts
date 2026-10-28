import { Course, CoursesResponse } from '../../../core/courses/courses.models';
import { StreakFlame } from './streak-flame';
import { CertificatesService } from '../../../core/certificates/certificates.service';
import { MyCertificate } from '../../../core/certificates/certificates.models';
import { AccountSettings } from './account-settings';
import { StudyStreak } from './study-streak';
import { HttpClient } from '@angular/common/http';
import { Component, computed, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AccessibilityService } from '../../../core/accessibility/accessibility.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { StudentIcon } from './student-icon';

export interface StudentEnrollment {
  id: number;
  courseId: number;
  status: 'ACTIVE' | 'COMPLETED';
  course: { id: number; title: string; imageUrl: string | null; level: string };
  progress: { percent: number; totalLessons: number; completedLessons: number };
}
interface StudentNotification {
  id: number;
  title: string;
  message?: string | null;
  courseId?: number | null;
}

@Component({
  selector: 'app-student-dashboard',
  imports: [RouterLink, StudentIcon, StudyStreak, AccountSettings, StreakFlame],
  templateUrl: './student-dashboard.html',
  styleUrl: './student-dashboard.scss',
})
export class StudentDashboard {
  readonly auth = inject(AuthService);
  readonly settings = inject(AccessibilityService);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  readonly streakDays = signal<number | null>(null);
  readonly enrollments = signal<StudentEnrollment[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly query = signal('');
  readonly filter = signal<'all' | 'ACTIVE' | 'COMPLETED'>('all');
  readonly menuOpen = signal(false);
  readonly panel = signal<
    'account' | 'settings' | 'notifications' | 'certificates' | 'courses' | null
  >(null);
  readonly notificationLoading = signal(false);
  readonly notificationError = signal('');
  readonly notifications = signal<StudentNotification[]>([]);
  readonly unread = signal(0);
  readonly firstName = computed(() => this.auth.user()?.firstName?.trim() || 'Estudiante');
  readonly initials = computed(() =>
    (this.firstName()[0] + (this.auth.user()?.lastName?.[0] ?? '')).toUpperCase(),
  );
  readonly active = computed(() => this.enrollments().filter((item) => item.status === 'ACTIVE'));
  readonly completed = computed(() =>
    this.enrollments().filter((item) => item.status === 'COMPLETED'),
  );
  readonly pending = computed(() =>
    this.active().filter((item) => item.progress.completedLessons === 0),
  );
  readonly inProgress = computed(() =>
    this.active().filter((item) => item.progress.completedLessons > 0),
  );
  readonly completedLessons = computed(() =>
    this.enrollments().reduce((sum, item) => sum + item.progress.completedLessons, 0),
  );
  readonly totalLessons = computed(() =>
    this.enrollments().reduce((sum, item) => sum + item.progress.totalLessons, 0),
  );
  readonly overallProgress = computed(() =>
    this.totalLessons() ? Math.round((this.completedLessons() / this.totalLessons()) * 100) : 0,
  );
  readonly featured = computed(() => this.inProgress()[0] ?? this.active()[0]);
  readonly visible = computed(() => {
    const normalize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase();
    const search = normalize(this.query().trim());
    return this.enrollments().filter(
      (item) =>
        (this.filter() === 'all' || item.status === this.filter()) &&
        normalize(item.course.title).includes(search),
    );
  });
  readonly levelLabels: Record<string, string> = {
    BEGINNER: 'Principiante',
    INTERMEDIATE: 'Intermedio',
    ADVANCED: 'Avanzado',
  };

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const panel = params.get('panel');
        if (panel === 'notifications') this.openNotifications();
        else if (panel === 'account') this.panel.set('account');
      });
    this.load();
    this.loadCertificates();
    this.loadRecommendations();
  }

  readonly coursePage = signal(0);
  readonly recommendationPage = signal(0);
  readonly catalogue = signal<Course[]>([]);
  readonly recommendationsLoading = signal(true);
  readonly recommendationsError = signal('');
  readonly coursePages = computed(() => Math.max(1, Math.ceil(this.visible().length / 2)));
  readonly currentCoursePage = computed(() => Math.min(this.coursePage(), this.coursePages() - 1));
  readonly continuingCourses = computed(() => {
    const items = [...this.visible()].sort(
      (a, b) => Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED'),
    );
    return items.slice(this.currentCoursePage() * 2, this.currentCoursePage() * 2 + 2);
  });
  readonly recommendations = computed(() => {
    const enrolled = new Set(this.enrollments().map((item) => String(item.courseId)));
    return this.catalogue().filter((item) => !enrolled.has(String(item.id)));
  });
  readonly recommendationPages = computed(() =>
    Math.max(1, Math.ceil(this.recommendations().length / 4)),
  );
  readonly currentRecommendationPage = computed(() =>
    Math.min(this.recommendationPage(), this.recommendationPages() - 1),
  );
  readonly suggestedCourses = computed(() =>
    this.recommendations().slice(
      this.currentRecommendationPage() * 4,
      this.currentRecommendationPage() * 4 + 4,
    ),
  );

  loadRecommendations(): void {
    this.recommendationsLoading.set(true);
    this.recommendationsError.set('');
    this.http
      .get<CoursesResponse>('/api/courses')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.catalogue.set(response.data);
          this.recommendationsLoading.set(false);
        },
        error: () => {
          this.recommendationsError.set('No pudimos cargar los cursos sugeridos.');
          this.recommendationsLoading.set(false);
        },
      });
  }

  private readonly certificateService = inject(CertificatesService);
  readonly certificates = signal<MyCertificate[]>([]);
  readonly certificatesLoading = signal(false);
  readonly certificatesError = signal('');
  readonly downloadingCertificate = signal<number | null>(null);
  readonly downloadError = signal('');
  readonly validCertificates = computed(() =>
    this.certificates().filter((item) => item.status === 'VALID'),
  );

  loadCertificates(): void {
    if (this.certificatesLoading()) return;
    this.certificatesLoading.set(true);
    this.certificatesError.set('');
    this.certificateService
      .mine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.certificates.set(items);
          this.certificatesLoading.set(false);
        },
        error: () => {
          this.certificatesError.set('No pudimos cargar tus certificados. Intenta de nuevo.');
          this.certificatesLoading.set(false);
        },
      });
  }

  openCertificates(): void {
    this.panel.set('certificates');
  }

  downloadCertificate(certificate: MyCertificate): void {
    if (this.downloadingCertificate() !== null) return;
    this.downloadingCertificate.set(certificate.id);
    this.downloadError.set('');
    this.certificateService
      .pdf(certificate.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'certificado-' + certificate.code + '.pdf';
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          this.downloadingCertificate.set(null);
        },
        error: () => {
          this.downloadError.set('No pudimos descargar el certificado. Intenta de nuevo.');
          this.downloadingCertificate.set(null);
        },
      });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http
      .get<StudentEnrollment[]>('/api/enrollments/mine')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.enrollments.set(items);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(
            apiErrorMessage(error, 'No pudimos cargar tu aprendizaje. Intenta de nuevo.'),
          );
          this.loading.set(false);
        },
      });
  }

  showAll(): void {
    this.query.set('');
    this.filter.set('all');
    this.menuOpen.set(false);
  }

  openNotifications(): void {
    if (this.panel() === 'notifications') {
      this.closePanel();
      return;
    }
    this.panel.set('notifications');
    if (this.notificationLoading()) return;
    this.notificationLoading.set(true);
    this.notificationError.set('');
    this.http
      .get<{ items: StudentNotification[]; unread: number }>('/api/notifications?limit=8')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.notifications.set(result.items);
          this.unread.set(result.unread);
          this.notificationLoading.set(false);
        },
        error: (error: unknown) => {
          this.notificationError.set(
            apiErrorMessage(error, 'No pudimos cargar tus notificaciones.'),
          );
          this.notificationLoading.set(false);
        },
      });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }

  closePanel(): void {
    this.panel.set(null);
    void this.router.navigate([], {
      queryParams: { panel: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  @HostListener('document:keydown.escape')
  closeMenus(): void {
    this.menuOpen.set(false);
    this.closePanel();
  }
}
