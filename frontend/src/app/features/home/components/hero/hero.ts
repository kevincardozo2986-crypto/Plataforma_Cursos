import { Component, afterNextRender, DestroyRef, ElementRef, NgZone, inject } from '@angular/core';

import { RouterLink } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';

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
        const pointerMove = (event: PointerEvent) => {
          if (!motion.matches || event.pointerType !== 'mouse') return;
          const bounds = host.getBoundingClientRect();
          host.style.setProperty(
            '--pointer-x',
            `${((event.clientX - bounds.left) / bounds.width - 0.5) * 18}px`,
          );
          host.style.setProperty(
            '--pointer-y',
            `${((event.clientY - bounds.top) / bounds.height - 0.5) * 14}px`,
          );
        };
        const resetPointer = () => {
          host.style.setProperty('--pointer-x', '0px');
          host.style.setProperty('--pointer-y', '0px');
        };
        host.addEventListener('pointermove', pointerMove, { passive: true });
        host.addEventListener('pointerleave', resetPointer);
        motion.addEventListener('change', resetPointer);
        this.destroyRef.onDestroy(() => {
          host.removeEventListener('pointermove', pointerMove);
          host.removeEventListener('pointerleave', resetPointer);
          motion.removeEventListener('change', resetPointer);
        });
      }),
    );
  }
}
