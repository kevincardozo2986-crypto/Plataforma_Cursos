import { AfterViewInit, Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

const MODELS = [
  { course: 'Desarrollo web', field: 'Tecnología', variant: 'blue' },
  { course: 'Marketing digital', field: 'Negocios', variant: 'teal' },
  { course: 'Análisis de datos', field: 'Tecnología', variant: 'classic' },
  { course: 'Gestión de proyectos', field: 'Desarrollo profesional', variant: 'blue' },
  { course: 'Diseño y creatividad', field: 'Innovación', variant: 'teal' },
  { course: 'Comunicación efectiva', field: 'Habilidades', variant: 'classic' },
];

@Component({
  selector: 'app-certificates-section',
  imports: [RouterLink],
  templateUrl: './certificates-section.html',
  styleUrl: './certificates-section.scss',
})
export class CertificatesSection implements AfterViewInit {
  readonly rows = [[...MODELS, ...MODELS]];
  readonly copies = [0, 1];
  readonly motionPaused = signal(false);
  readonly introVisible = signal(false);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private syncMotion = () => {};

  toggleMotion(): void {
    this.motionPaused.update((value) => !value);
    this.syncMotion();
  }

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;
    const host = this.element.nativeElement;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const intro = host.querySelector<HTMLElement>('.intro')!;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.introVisible.set(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    queueMicrotask(() => {
      if (this.destroyRef.destroyed) return;
      observer.observe(intro);
    });

    const cleanups: (() => void)[] = [];
    const refreshers: (() => void)[] = [];
    host.querySelectorAll<HTMLElement>('.marquee-row').forEach((row) => {
      const track = row.querySelector<HTMLElement>('.marquee-track')!;
      let hovered = false;
      let frame = 0;
      const adjust = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        const animation = track.getAnimations()[0];
        if (!animation || motion.matches) return;
        const from = animation.playbackRate;
        const target = hovered || this.motionPaused() ? 0 : 1;
        if (from === target) return;
        const start = performance.now();
        const tick = (time: number) => {
          const progress = Math.min(1, (time - start) / 280);
          const eased = 1 - Math.pow(1 - progress, 3);
          animation.updatePlaybackRate(from + (target - from) * eased);
          if (progress < 1) frame = requestAnimationFrame(tick);
          else frame = 0;
        };
        frame = requestAnimationFrame(tick);
      };
      const enter = (event: PointerEvent) => {
        if (event.pointerType !== 'touch') {
          hovered = true;
          adjust();
        }
      };
      const leave = () => {
        hovered = false;
        adjust();
      };
      row.addEventListener('pointerenter', enter);
      row.addEventListener('pointerleave', leave);
      refreshers.push(adjust);
      cleanups.push(() => {
        cancelAnimationFrame(frame);
        row.removeEventListener('pointerenter', enter);
        row.removeEventListener('pointerleave', leave);
      });
    });
    this.syncMotion = () => refreshers.forEach((refresh) => refresh());
    const motionChange = () => this.syncMotion();
    motion.addEventListener('change', motionChange);
    this.syncMotion();
    this.destroyRef.onDestroy(() => {
      observer.disconnect();
      cleanups.forEach((cleanup) => cleanup());
      motion.removeEventListener('change', motionChange);
      this.syncMotion = () => {};
    });
  }
}
