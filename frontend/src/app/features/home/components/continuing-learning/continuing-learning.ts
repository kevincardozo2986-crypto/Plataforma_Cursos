import { afterNextRender, Component, DestroyRef, ElementRef, inject, NgZone } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-continuing-learning',
  imports: [RouterLink],
  templateUrl: './continuing-learning.html',
  styleUrl: './continuing-learning.scss',
})
export class ContinuingLearning {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);

  constructor() {
    afterNextRender(() =>
      this.zone.runOutsideAngular(() => {
        const host = this.element.nativeElement;
        const section = host.querySelector<HTMLElement>('section')!;
        const motion = window.matchMedia('(prefers-reduced-motion: no-preference)');
        const lines = Array.from(host.querySelectorAll<HTMLElement>('.title-line'));
        let frame = 0;
        let visible = true;
        const update = () => {
          frame = 0;
          const bounds = section.getBoundingClientRect();
          const progress = Math.min(
            1,
            Math.max(0, (window.innerHeight * 0.8 - bounds.top) / (bounds.height * 0.85)),
          );
          const title = host.querySelector<HTMLElement>('.title-stage')!.getBoundingClientRect();
          const reveal = Math.min(
            1,
            Math.max(0, (window.innerHeight * 0.94 - title.top) / (window.innerHeight * 0.42)),
          );
          const secondReveal = Math.min(1, Math.max(0, (reveal - 0.12) / 0.88));
          host.style.setProperty('--first-slide', motion.matches ? `${reveal * 10}vw` : '10vw');
          lines.forEach((line, lineIndex) => {
            const letters = Array.from(line.querySelectorAll<HTMLElement>('.title-letter'));
            letters.forEach((letter, index) => {
              const delay = (index / Math.max(1, letters.length - 1)) * 0.22 + lineIndex * 0.1;
              const local = Math.min(1, Math.max(0, (reveal - delay) / (1 - delay)));
              const eased = 1 - Math.pow(1 - local, 3);
              letter.style.transform = motion.matches
                ? `translateY(${(1 - eased) * 115}%)`
                : 'none';
            });
          });
          host.style.setProperty('--line-one', motion.matches ? `${(1 - reveal) * 115}%` : '0%');
          host.style.setProperty(
            '--line-two',
            motion.matches ? `${(1 - secondReveal) * 115}%` : '0%',
          );
          host.style.setProperty('--draw', motion.matches ? String(1 - progress) : '0');
          host.style.setProperty(
            '--title-shift',
            motion.matches ? `${(1 - progress) * 24}px` : '0px',
          );
          host.style.setProperty(
            '--image-shift',
            motion.matches ? `${(1 - progress) * 65}px` : '0px',
          );
          if (bounds.top < window.innerHeight * 0.88 || !motion.matches)
            host.classList.add('entered');
        };
        const schedule = () => {
          if (visible && !frame) frame = requestAnimationFrame(update);
        };
        const observer = new IntersectionObserver(
          (entries) => {
            visible = entries[0].isIntersecting;
            if (visible) schedule();
          },
          { rootMargin: '150px' },
        );
        if (motion.matches) host.classList.add('motion-ready');
        const motionChange = () => {
          host.classList.toggle('motion-ready', motion.matches);
          update();
        };
        observer.observe(section);
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule, { passive: true });
        motion.addEventListener('change', motionChange);
        update();
        this.destroyRef.onDestroy(() => {
          observer.disconnect();
          window.removeEventListener('scroll', schedule);
          window.removeEventListener('resize', schedule);
          motion.removeEventListener('change', motionChange);
          if (frame) cancelAnimationFrame(frame);
        });
      }),
    );
  }
}
