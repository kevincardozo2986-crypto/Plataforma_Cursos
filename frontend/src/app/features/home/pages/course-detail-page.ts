import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Course } from '../../../core/courses/courses.models';
import { isPlayableVideoUrl } from '../../../core/uploads/upload-rules';

@Component({
  selector: 'app-course-detail-page',
  imports: [RouterLink],
  templateUrl: './course-detail-page.html',
  styleUrl: './course-detail-page.scss',
})
export class CourseDetailPage {
  readonly isPlayableVideoUrl = isPlayableVideoUrl;
  readonly videoError = signal(false);
  readonly course = signal<Course | null>(null);
  readonly error = signal(false);
  private readonly http = inject(HttpClient);
  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(
        switchMap((params) =>
          this.http.get<Course>('/api/courses/' + encodeURIComponent(params.get('id') || '')),
        ),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (course) => { this.course.set(course); this.videoError.set(false); },
        error: () => this.error.set(true),
      });
  }
}
