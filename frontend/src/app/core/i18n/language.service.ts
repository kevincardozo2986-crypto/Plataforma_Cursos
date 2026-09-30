import { DOCUMENT } from '@angular/common';
import { afterNextRender, effect, inject, Injectable, signal } from '@angular/core';
import { english, Language } from './translations';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly document = inject(DOCUMENT);
  private readonly current = signal<Language>('es');
  private readonly ready = signal(false);
  readonly language = this.current.asReadonly();

  constructor() {
    afterNextRender(() => {
      try {
        this.current.set(
          this.document.defaultView?.localStorage.getItem('campus.language') === 'en' ? 'en' : 'es',
        );
      } catch {
        /* Default to Spanish when browser storage is unavailable. */
      }
      this.ready.set(true);
    });
    effect(() => {
      if (!this.ready()) return;
      const language = this.language();
      this.document.documentElement.lang = language;
      this.document.title =
        language === 'en'
          ? 'Virtual Campus | Santo Tomás Tunja'
          : 'Campus Virtual | Santo Tomás Tunja';
      try {
        this.document.defaultView?.localStorage.setItem('campus.language', language);
      } catch {
        /* Language switching remains available for this visit. */
      }
    });
  }

  setLanguage(language: Language) {
    this.current.set(language);
  }
  translate(text: string): string {
    return this.language() === 'en' ? (english[text] ?? text) : text;
  }
}
