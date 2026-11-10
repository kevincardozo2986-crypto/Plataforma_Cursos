import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
}

/** Avisos emergentes («Módulo guardado»…): se ven en el centro de la pantalla aunque estés abajo en la página. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly current = signal<Toast | null>(null);

  private seq = 0;
  private timer?: ReturnType<typeof setTimeout>;

  show(message: string, ms = 2800): void {
    clearTimeout(this.timer);
    this.current.set({ id: ++this.seq, message });
    this.timer = setTimeout(() => this.dismiss(), ms);
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.current.set(null);
  }
}
