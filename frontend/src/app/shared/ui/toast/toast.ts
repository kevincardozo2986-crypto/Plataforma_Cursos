import { Component, DestroyRef, inject } from '@angular/core';

import { ToastService } from '../../../core/feedback/toast.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Icon } from '../icon/icon';

/** Mensajes de éxito que antes salían en la parte de arriba de cada pantalla. */
const SUCCESS = '.panel-alert--ok, p.success[role="status"]';

@Component({
  selector: 'app-toast',
  imports: [TranslatePipe, Icon],
  template: `
    @if (toast.current(); as item) {
      <div class="backdrop" (click)="toast.dismiss()">
        <div class="box" role="status" aria-live="polite" (click)="$event.stopPropagation()">
          <app-icon name="check-circle" [size]="34" />
          <p>{{ item.message | t }}</p>
          <button type="button" (click)="toast.dismiss()">{{ 'Entendido' | t }}</button>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 2000;
      display: grid;
      place-items: center;
      padding: 16px;
      background: rgba(15, 28, 48, 0.35);
    }
    .box {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
      min-width: 260px;
      max-width: 420px;
      padding: 24px 28px;
      color: #17703d;
      text-align: center;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 20px 50px rgba(15, 28, 48, 0.3);
      animation: pop 0.18s ease-out;
    }
    p {
      margin: 0;
      color: #12304f;
      font-size: 1.02rem;
      font-weight: 650;
    }
    button {
      padding: 8px 20px;
      color: #fff;
      font-weight: 650;
      background: #1463d8;
      border: 0;
      border-radius: 999px;
      cursor: pointer;
    }
    @keyframes pop {
      from { opacity: 0; transform: scale(0.94); }
    }
  `,
})
export class Toast {
  readonly toast = inject(ToastService);

  constructor() {
    if (typeof MutationObserver === 'undefined') return;

    // Todos los mensajes de éxito de la plataforma («guardado», «enviado»…) se muestran en el aviso
    // emergente: aquí se detectan cuando aparecen en la página y se ocultan los de la parte de arriba.
    const observer = new MutationObserver((mutations) => {
      const found = new Set<Element>();

      for (const mutation of mutations) {
        const nodes = [mutation.target, ...Array.from(mutation.addedNodes)];

        for (const node of nodes) {
          const element = node instanceof Element ? node : node.parentElement;

          if (!element) continue;

          const own = element.closest(SUCCESS);

          if (own) found.add(own);
          element.querySelectorAll(SUCCESS).forEach((child) => found.add(child));
        }
      }

      for (const element of found) {
        const message = element.textContent?.replace(/\s+/g, ' ').trim();

        if (message && message !== this.last) {
          this.last = message;
          this.toast.show(message, 3500);
          setTimeout(() => (this.last = ''), 800);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  private last = '';
}
