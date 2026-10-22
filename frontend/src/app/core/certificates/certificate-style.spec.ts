import { describe, expect, it } from 'vitest';

import {
  AUTO_BOLD,
  cleanOffsets,
  cleanStyle,
  clampOffset,
  OFFSET_MAX_X,
  OFFSET_MAX_Y,
  resolveText,
  VEIL_MAX,
} from './certificate-style';

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

describe('velo', () => {
  it('se guarda entero y acotado; 0 no se guarda', () => {
    expect(cleanStyle({ veil: 60 })).toEqual({ veil: 60 });
    expect(cleanStyle({ veil: 999 })).toEqual({ veil: VEIL_MAX });
    expect(cleanStyle({ veil: 0 })).toEqual({});
    expect(cleanStyle({ veil: undefined })).toEqual({});
  });
});

describe('posición de los textos', () => {
  it('clampOffset deja enteros y dentro de los límites', () => {
    expect(clampOffset({ x: 10.6, y: -3.2 })).toEqual({ x: 11, y: -3 });
    expect(clampOffset({ x: 9999, y: -9999 })).toEqual({ x: OFFSET_MAX_X, y: -OFFSET_MAX_Y });
    expect(clampOffset({ x: NaN, y: 5 })).toEqual({ x: 0, y: 5 });
  });

  it('cleanOffsets guarda solo lo que se movió', () => {
    expect(cleanOffsets({ title: { x: 0, y: 0 }, body: { x: 5, y: 0 } })).toEqual({
      body: { x: 5, y: 0 },
    });
    expect(cleanOffsets({ title: { x: 0, y: 0 } })).toBeUndefined();
    expect(cleanOffsets(undefined)).toBeUndefined();
  });

  it('cleanStyle incluye las posiciones', () => {
    expect(cleanStyle({ offsets: { signature: { x: -20, y: 10 } } })).toEqual({
      offsets: { signature: { x: -20, y: 10 } },
    });
    expect(cleanStyle({ offsets: {} })).toEqual({});
  });
});
