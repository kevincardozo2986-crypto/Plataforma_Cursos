import { Component, model, signal } from '@angular/core';

type Language = 'es' | 'en';

@Component({
  selector: 'app-accessibility-menu',
  templateUrl: './accessibility-menu.html',
  styleUrl: './accessibility-menu.scss',
})
export class AccessibilityMenu {
  readonly contrast = model(false);
  readonly largeText = model(false);

  readonly open = signal(false);
  readonly darkMode = signal(false);
  readonly language = signal<Language>('es');

  toggleDarkMode(): void {
    this.darkMode.update((value) => !value);

    document.documentElement.classList.toggle(
      'dark-mode',
      this.darkMode(),
    );
  }

  changeLanguage(language: Language): void {
    this.language.set(language);
  }
}