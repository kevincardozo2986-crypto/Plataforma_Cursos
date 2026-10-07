import { DOCUMENT } from '@angular/common';
import { afterNextRender, effect, inject, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AccessibilityService {
  private readonly document = inject(DOCUMENT);
  private readonly ready = signal(false);
  readonly contrast = signal(false);
  readonly largeText = signal(false);
  readonly darkMode = signal(false);

  constructor() {
    afterNextRender(() => {
      try {
        const saved = JSON.parse(
          this.document.defaultView?.localStorage.getItem('campus.accessibility') ?? '{}',
        );
        this.contrast.set(saved?.contrast === true);
        this.largeText.set(saved?.largeText === true);
        this.darkMode.set(saved?.darkMode === true);
      } catch {
        /* Storage may be unavailable or contain invalid data. */
      }
      this.ready.set(true);
    });
    effect(() => {
      if (!this.ready()) return;
      const preferences = {
        contrast: this.contrast(),
        largeText: this.largeText(),
        darkMode: this.darkMode(),
      };
      const root = this.document.documentElement;
      root.classList.toggle('a11y-contrast', preferences.contrast);
      root.classList.toggle('a11y-large-text', preferences.largeText);
      root.classList.toggle('a11y-dark', preferences.darkMode);
      try {
        this.document.defaultView?.localStorage.setItem(
          'campus.accessibility',
          JSON.stringify(preferences),
        );
      } catch {
        /* Settings still work for the current visit. */
      }
    });
  }

  reset() {
    this.contrast.set(false);
    this.largeText.set(false);
    this.darkMode.set(false);
  }
}
