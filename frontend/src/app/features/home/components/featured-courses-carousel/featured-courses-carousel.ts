import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  NgZone,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { timeout } from 'rxjs';
import { CoursesService } from '../../../../core/courses/courses.service';
import { Course } from '../../../../core/courses/courses.models';

@Component({
  selector: 'app-featured-courses-carousel',
  imports: [RouterLink],
  templateUrl: './featured-courses-carousel.html',
  styleUrl: './featured-courses-carousel.scss',
})
export class FeaturedCoursesCarousel {
  private readonly api = inject(CoursesService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  readonly courses = signal<Course[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);

  constructor() {
    afterNextRender(() => {
      this.api
        .getCourses()
        .pipe(timeout(8000), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => {
            this.courses.set(result.data.slice(0, 6));
            this.loading.set(false);
          },
          error: () => {
            this.error.set(true);
            this.loading.set(false);
          },
        });
    });
    afterNextRender(() =>
      this.zone.runOutsideAngular(() => {
        const host = this.element.nativeElement;
        const track = host.querySelector<HTMLElement>('.course-track')!;
        const motion = window.matchMedia('(prefers-reduced-motion: no-preference)');
        let active = false,
          dragged = false,
          start = 0,
          previous = 0,
          velocity = 0,
          time = 0,
          frame = 0;
        const stop = () => {
          cancelAnimationFrame(frame);
          frame = 0;
        };
        const down = (event: PointerEvent) => {
          if (event.pointerType !== 'mouse' || event.button !== 0) return;
          stop();
          active = true;
          dragged = false;
          start = previous = event.clientX;
          time = performance.now();
          velocity = 0;
        };
        const move = (event: PointerEvent) => {
          if (!active) return;
          if (!dragged && Math.abs(event.clientX - start) < 6) return;
          dragged = true;
          track.classList.add('dragging');
          const now = performance.now();
          const delta = previous - event.clientX;
          velocity = (delta / Math.max(16, now - time)) * 16;
          track.scrollLeft += delta;
          previous = event.clientX;
          time = now;
          event.preventDefault();
        };
        const up = () => {
          if (!active) return;
          active = false;
          track.classList.remove('dragging');
          if (!dragged || !motion.matches || performance.now() - time > 100) return;
          let last = performance.now();
          const coast = (now: number) => {
            const step = Math.min(2, (now - last) / 16);
            last = now;
            const before = track.scrollLeft;
            track.scrollLeft += velocity * step;
            velocity *= Math.pow(0.92, step);
            if (Math.abs(velocity) > 0.4 && track.scrollLeft !== before)
              frame = requestAnimationFrame(coast);
          };
          frame = requestAnimationFrame(coast);
        };
        const click = (event: MouseEvent) => {
          if (dragged && event.detail > 0) {
            event.preventDefault();
            event.stopPropagation();
            dragged = false;
          }
        };
        const key = (event: KeyboardEvent) => {
          if (
            event.target !== track ||
            !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
          )
            return;
          event.preventDefault();
          stop();
          const left =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? track.scrollWidth
                : track.scrollLeft +
                  (event.key === 'ArrowRight' ? 1 : -1) * track.clientWidth * 0.7;
          track.scrollTo({ left, behavior: motion.matches ? 'smooth' : 'auto' });
        };
        const dragStart = (event: DragEvent) => event.preventDefault();
        const observer = new IntersectionObserver(
          (entries) => {
            if (entries[0].isIntersecting) {
              host.classList.add('revealed');
              observer.disconnect();
            }
          },
          { threshold: 0.12 },
        );
        host.classList.add('animate');
        observer.observe(host);
        track.addEventListener('pointerdown', down);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('blur', up);
        track.addEventListener('click', click, true);
        track.addEventListener('keydown', key);
        track.addEventListener('dragstart', dragStart);
        this.destroyRef.onDestroy(() => {
          stop();
          observer.disconnect();
          track.removeEventListener('pointerdown', down);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('blur', up);
          track.removeEventListener('click', click, true);
          track.removeEventListener('keydown', key);
          track.removeEventListener('dragstart', dragStart);
        });
      }),
    );
  }

  image(course: Course): string | null {
    return course.imageUrl || course.image || course.thumbnail || null;
  }
}
