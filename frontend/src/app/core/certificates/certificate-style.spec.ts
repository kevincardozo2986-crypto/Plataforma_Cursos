import { describe, expect, it } from 'vitest';

import { AUTO_BOLD, cleanStyle, resolveText } from './certificate-style';

describe('resolveText', () => {
  it('automática: negrita en título y nombre solo si la tipografía la tiene', () => {
    expect(resolveText(undefined, AUTO_BOLD.title, { hasBold: true }).bold).toBe(true);
    expect(resolveText(undefined, AUTO_BOLD.title, { hasBold: false }).bold).toBe(false);
    expect(resolveText(undefined, AUTO_BOLD.body, { hasBold: true }).bold).toBe(false);
  });

  it('forzar la negrita en una tipografía sin ella la marca como sintética', () => {
    const r = resolveText({ bold: true }, AUTO_BOLD.body, { hasBold: false });

    expect(r.bold).toBe(true);
    expect(r.synthetic).toBe(true);
  });

  it('quitar la negrita gana sobre la automática', () => {
    expect(resolveText({ bold: false }, AUTO_BOLD.name, { hasBold: true }).bold).toBe(false);
  });

  it('acota el tamaño y valida el color', () => {
    expect(resolveText({ size: 500 }, true, undefined).scale).toBe(1.4);
    expect(resolveText({ size: 10 }, true, undefined).scale).toBe(0.6);
    expect(resolveText({ color: 'rojo' }, true, undefined).color).toBeNull();
    expect(resolveText({ color: '#B91C1C' }, true, undefined).color).toBe('#B91C1C');
  });
});

describe('cleanStyle', () => {
  it('descarta lo que es igual al diseño', () => {
    expect(cleanStyle({ title: { size: 100 }, name: {}, showDocument: true })).toEqual({});
  });

  it('conserva lo cambiado y pone el color en mayúsculas', () => {
    expect(
      cleanStyle({
        title: { bold: false, italic: true, size: 120, color: '#b91c1c' },
        showDocument: false,
      }),
    ).toEqual({
      title: { bold: false, italic: true, size: 120, color: '#B91C1C' },
      showDocument: false,
    });
  });
});
