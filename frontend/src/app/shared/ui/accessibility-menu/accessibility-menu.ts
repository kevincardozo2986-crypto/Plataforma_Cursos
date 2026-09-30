import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { LanguageService } from '../../../core/i18n/language.service';
import {
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { AccessibilityService } from '../../../core/accessibility/accessibility.service';

@Component({
  imports: [TranslatePipe],
  selector: 'app-accessibility-menu',
  templateUrl: './accessibility-menu.html',
  styleUrl: './accessibility-menu.scss',
})
export class AccessibilityMenu {
  readonly language = inject(LanguageService);
  readonly settings = inject(AccessibilityService);

  readonly open = signal(false);

  private readonly element =
    inject(ElementRef<HTMLElement>);

  readonly trigger =
    viewChild<ElementRef<HTMLButtonElement>>(
      'trigger',
    );

  close() {
    this.open.set(false);

    this.trigger()?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.open()) {
      this.close();
    }
  }

  @HostListener(
    'document:click',
    ['$event'],
  )
  onOutsideClick(event: Event) {
    if (
      !this.element.nativeElement.contains(
        event.target as Node,
      )
    ) {
      this.open.set(false);
    }
  }
}