import { RichHtmlPipe } from '../../../shared/pipes/rich-html.pipe';
import { CoursePlayer } from '../../student/course-player/course-player';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { catchError, of, switchMap, takeUntil, skip, throwError } from 'rxjs';
import { Course } from '../../../core/courses/courses.models';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorMessage } from '../../../core/http/api-error';
import { formatDuration } from '../../../core/utils/format-duration';
import { isPlayableVideoUrl } from '../../../core/uploads/upload-rules';

export interface CourseDetail extends Course {
  teacher?: { firstName: string; lastName: string };
  instructors?: { id: number; firstName: string; lastName: string }[];
  whatYouWillLearn?: string | null;
  audience?: string | null;
  materials?: string | null;
  requirements?: string | null;
  durationMinutes?: number | null;
  visibility?: string;
  maxStudents?: number | null;
  modules?: {
    id: number;
    title: string;
    description?: string;
    lessons: { id: number; title: string; durationMinutes?: number | null }[];
  }[];
}
interface CourseProgress {
  completedLessonIds?: number[];
  status: 'ACTIVE' | 'COMPLETED';
  percent: number;
  completedLessons: number;
  totalLessons: number;
}

@Component({
  selector: 'app-course-detail-page',
  imports: [RouterLink, FormsModule, CoursePlayer, RichHtmlPipe],
  templateUrl: './course-detail-page.html',
  styleUrl: './course-detail-page.scss',
})
export class CourseDetailPage {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  readonly isPlayableVideoUrl = isPlayableVideoUrl;
  readonly formatDuration = formatDuration;
  readonly videoError = signal(false);
  readonly course = signal<CourseDetail | null>(null);
  readonly error = signal(false);
  readonly lessonCount = computed(
    () => this.course()?.modules?.reduce((total, module) => total + module.lessons.length, 0) ?? 0,
  );
  readonly progress = signal<CourseProgress | null>(null);
  readonly checking = signal(false);
  readonly enrollmentKnown = signal(false);
  readonly submitting = signal(false);
  readonly enrollmentError = signal('');
  readonly enrollmentNotice = signal('');
  password = '';
  readonly levelLabels: Record<string, string> = {
    BEGINNER: 'Principiante',
    INTERMEDIATE: 'Intermedio',
    ADVANCED: 'Avanzado',
  };

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          this.enrollmentKnown.set(false);
          this.course.set(null);
          this.error.set(false);
          this.progress.set(null);
          this.enrollmentError.set('');
          this.enrollmentNotice.set('');
          this.password = '';
          this.submitting.set(false);
          this.videoError.set(false);
          return this.http
            .get<CourseDetail>('/api/courses/' + encodeURIComponent(params.get('id') || ''))
            .pipe(
              catchError(() => {
                this.error.set(true);
                return of(null);
              }),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((course) => {
        this.course.set(course);
        if (course && this.auth.user()?.role === 'STUDENT') this.checkEnrollment();
      });
  }

  price(value: Course['price']): string {
    const amount = Number(value ?? 0);
    return amount === 0
      ? 'Gratis'
      : new Intl.NumberFormat('es-CO', {
          style: 'currency',
          currency: 'COP',
          maximumFractionDigits: 0,
        }).format(amount);
  }

  checkEnrollment(): void {
    const course = this.course();
    if (!course) return;
    this.checking.set(true);
    this.enrollmentError.set('');
    this.http
      .get<CourseProgress>('/api/courses/' + course.id + '/progress')
      .pipe(
        catchError((error: unknown) =>
          error instanceof HttpErrorResponse && error.status === 404
            ? of(null)
            : throwError(() => error),
        ),
        takeUntil(this.route.paramMap.pipe(skip(1))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (progress) => {
          this.progress.set(progress);
          this.checking.set(false);
          this.enrollmentKnown.set(true);
        },
        error: (error: unknown) => {
          this.checking.set(false);
          this.enrollmentError.set(apiErrorMessage(error, 'No pudimos comprobar tu inscripción.'));
        },
      });
  }

  enroll(): void {
    const course = this.course();
    if (
      !course ||
      this.auth.user()?.role !== 'STUDENT' ||
      !this.enrollmentKnown() ||
      this.checking() ||
      this.submitting() ||
      this.progress()
    )
      return;
    this.submitting.set(true);
    this.enrollmentError.set('');
    this.enrollmentNotice.set('');
    this.http
      .post(
        '/api/courses/' + course.id + '/enroll',
        course.visibility === 'PASSWORD' ? { password: this.password } : {},
      )
      .pipe(takeUntil(this.route.paramMap.pipe(skip(1))), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.password = '';
          this.enrollmentNotice.set('¡Inscripción realizada! El curso ya aparece en Mis cursos.');
          this.progress.set({
            status: 'ACTIVE',
            percent: 0,
            completedLessons: 0,
            totalLessons:
              course.modules?.reduce((sum, module) => sum + module.lessons.length, 0) ?? 0,
          });
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.enrollmentError.set(
            apiErrorMessage(error, 'No pudimos inscribirte. Intenta nuevamente.'),
          );
        },
      });
  }
}
