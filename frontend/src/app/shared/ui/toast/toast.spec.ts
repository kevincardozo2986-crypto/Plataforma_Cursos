import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ToastService } from '../../../core/feedback/toast.service';
import { Toast } from './toast';

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('Toast', () => {
  it('muestra en el aviso emergente los mensajes de éxito que aparecen en la página', async () => {
    const fixture = TestBed.createComponent(Toast);
    const toast = TestBed.inject(ToastService);

    fixture.detectChanges();

    const ok = document.createElement('p');

    ok.className = 'panel-alert panel-alert--ok';
    ok.setAttribute('role', 'status');
    ok.textContent = ' Módulo guardado ';
    document.body.append(ok);
    await tick();

    expect(toast.current()?.message).toBe('Módulo guardado');

    ok.remove();
    toast.dismiss();
    fixture.destroy();
  });

  it('ignora los avisos informativos', async () => {
    const fixture = TestBed.createComponent(Toast);
    const toast = TestBed.inject(ToastService);

    fixture.detectChanges();

    const info = document.createElement('p');

    info.className = 'notice';
    info.textContent = 'Algo informativo';
    document.body.append(info);
    await tick();

    expect(toast.current()).toBeNull();

    info.remove();
    fixture.destroy();
  });
});
