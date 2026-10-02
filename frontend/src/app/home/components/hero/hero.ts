import { Component, afterNextRender, DestroyRef, ElementRef, NgZone, inject } from '@angular/core';

import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-hero',

  imports: [RouterLink],

  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {
  readonly auth = inject(AuthService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);

  constructor() {
    afterNextRender(() =>
      this.zone.runOutsideAngular(() => {
        const host = this.element.nativeElement;
        const motion = window.matchMedia(
          '(prefers-reduced-motion: no-preference) and (min-width: 701px)',
        );
        let frame = 0;
        let lastProgress = -1;
        const update = () => {
          frame = 0;
          const bounds = host.getBoundingClientRect();
          const progress = motion.matches
            ? Math.min(1, Math.max(0, -bounds.top / Math.max(bounds.height, 1)))
            : 0;
          if (progress === lastProgress) return;
          lastProgress = progress;
          host.style.setProperty('--scroll-side', `${progress * -85}px`);
          host.style.setProperty('--scroll-center', `${progress * 35}px`);
          host.style.setProperty('--scroll-turn', `${progress * 55}deg`);
        };
        const schedule = () => {
          if (!frame) frame = requestAnimationFrame(update);
        };
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule, { passive: true });
        motion.addEventListener('change', schedule);
        update();
        this.destroyRef.onDestroy(() => {
          window.removeEventListener('scroll', schedule);
          window.removeEventListener('resize', schedule);
          motion.removeEventListener('change', schedule);
          cancelAnimationFrame(frame);
        });
      }),
    );
  }
}
