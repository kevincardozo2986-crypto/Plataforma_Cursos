import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { afterNextRender, Component, DestroyRef, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-learning-journey',
  imports: [TranslatePipe, RouterLink],
  templateUrl: './learning-journey.html',
  styleUrl: './learning-journey.scss',
})
export class LearningJourney {
  readonly inView = signal(false);
  readonly cards = [
    { theme: 'mint', title: 'Piensa en\ncódigo.', category: 'TECNOLOGÍA', number: '01' },
    { theme: 'orange', title: 'Dale forma\na tus ideas.', category: 'CREATIVIDAD', number: '02' },
    { theme: 'violet', title: 'Lee entre\nlos datos.', category: 'CONOCIMIENTO', number: '03' },
    { theme: 'blue', title: 'Tu mundo,\nsin límites.', category: 'CAMPUS VIRTUAL', number: '04' },
  ];
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  constructor() {
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver(
        ([entry]) => this.inView.set(entry.isIntersecting),
        { threshold: 0.1 },
      );
      observer.observe(this.element.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
