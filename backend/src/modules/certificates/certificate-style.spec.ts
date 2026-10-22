import { AUTO_BOLD, resolveText, sanitizeStyle, OFFSET_MAX_X, OFFSET_MAX_Y, SIZE_MAX, SIZE_MIN, VEIL_MAX } from './certificate-style.js';

describe('resolveText', () => {
  it('sin estilo: título y nombre en negrita si la tipografía la tiene; el texto, no', () => {
    expect(resolveText(undefined, AUTO_BOLD.title, true)).toMatchObject({ bold: true, syntheticBold: false, italic: false, scale: 1, color: null });
    expect(resolveText(undefined, AUTO_BOLD.name, true).bold).toBe(true);
    expect(resolveText(undefined, AUTO_BOLD.body, true).bold).toBe(false);
  });

  it('sin estilo y sin negrita real: normal (no se finge sola)', () => {
    expect(resolveText(undefined, AUTO_BOLD.title, false)).toMatchObject({ bold: false, syntheticBold: false });
  });

  it('forzar la negrita en una tipografía que no la tiene la dibuja con trazo', () => {
    expect(resolveText({ bold: true }, AUTO_BOLD.title, false)).toMatchObject({ bold: true, syntheticBold: true });
    expect(resolveText({ bold: true }, AUTO_BOLD.body, false)).toMatchObject({ bold: true, syntheticBold: true });
  });

  it('forzar la negrita en una que sí la tiene usa la real', () => {
    expect(resolveText({ bold: true }, AUTO_BOLD.body, true)).toMatchObject({ bold: true, syntheticBold: false });
  });

  it('quitar la negrita (false) gana a la automática', () => {
    expect(resolveText({ bold: false }, AUTO_BOLD.title, true).bold).toBe(false);
    expect(resolveText({ bold: null }, AUTO_BOLD.title, true).bold).toBe(true);
  });

  it('el tamaño es un porcentaje acotado', () => {
    expect(resolveText({ size: 120 }, true, true).scale).toBe(1.2);
    expect(resolveText({ size: 5 }, true, true).scale).toBe(SIZE_MIN / 100);
    expect(resolveText({ size: 9999 }, true, true).scale).toBe(SIZE_MAX / 100);
    expect(resolveText({ size: Number.NaN }, true, true).scale).toBe(1);
    expect(resolveText({ size: '120' as unknown as number }, true, true).scale).toBe(1);
  });

  it('el color solo vale si es hexadecimal de 6 dígitos', () => {
    expect(resolveText({ color: '#1F3A8A' }, true, true).color).toBe('#1F3A8A');
    for (const bad of ['rojo', '#123', 'red; background:url(x)', '#GGGGGG', '']) {
      expect(resolveText({ color: bad }, true, true).color).toBeNull();
    }
  });

  it('la cursiva solo si es exactamente true', () => {
    expect(resolveText({ italic: true }, true, true).italic).toBe(true);
    expect(resolveText({ italic: 'si' as unknown as boolean }, true, true).italic).toBe(false);
  });
});

describe('sanitizeStyle', () => {
  it('algo que no es un objeto da un estilo vacío', () => {
    for (const raw of [null, undefined, 'x', 5, [], true]) {
      expect(sanitizeStyle(raw)).toEqual({});
    }
  });

  it('conserva lo válido y descarta lo demás', () => {
    expect(
      sanitizeStyle({
        title: { bold: false, italic: true, size: 120, color: '#aabbcc', inventado: 1 },
        name: { size: 100 },
        body: { color: 'rojo' },
        showDocument: false,
        otro: 'x',
      }),
    ).toEqual({ title: { bold: false, italic: true, size: 120, color: '#AABBCC' }, showDocument: false });
  });

  it('acota los tamaños', () => {
    expect(sanitizeStyle({ title: { size: 500 } })).toEqual({ title: { size: SIZE_MAX } });
    expect(sanitizeStyle({ title: { size: 1 } })).toEqual({ title: { size: SIZE_MIN } });
  });

  it('mostrar la cédula es lo normal: solo se guarda cuando se apaga', () => {
    expect(sanitizeStyle({ showDocument: true })).toEqual({});
    expect(sanitizeStyle({ showDocument: false })).toEqual({ showDocument: false });
  });

  it('lo que es igual al valor por defecto no se guarda', () => {
    expect(sanitizeStyle({ title: { italic: false, size: 100, color: null } })).toEqual({});
  });
});


describe('velo', () => {
  it('se guarda entero y acotado a 80; 0 o inválido no se guarda', () => {
    expect(sanitizeStyle({ veil: 60 })).toEqual({ veil: 60 });
    expect(sanitizeStyle({ veil: 59.6 })).toEqual({ veil: 60 });
    expect(sanitizeStyle({ veil: 500 })).toEqual({ veil: VEIL_MAX });
    expect(sanitizeStyle({ veil: 0 })).toEqual({});
    expect(sanitizeStyle({ veil: -5 })).toEqual({});
    expect(sanitizeStyle({ veil: 'mucho' })).toEqual({});
  });
});


describe('posición de los textos', () => {
  it('se guardan enteros, acotados, solo de los bloques conocidos y sin los que no se movieron', () => {
    expect(sanitizeStyle({ offsets: { title: { x: 10.4, y: -20 }, body: { x: 0, y: 0 }, inventado: { x: 5, y: 5 } } })).toEqual({
      offsets: { title: { x: 10, y: -20 } },
    });
    expect(sanitizeStyle({ offsets: { signature: { x: 9999, y: -9999 } } })).toEqual({
      offsets: { signature: { x: OFFSET_MAX_X, y: -OFFSET_MAX_Y } },
    });
  });

  it('valores inválidos o sin ningún movimiento no dejan nada', () => {
    expect(sanitizeStyle({ offsets: { title: { x: 'mucho', y: NaN } } })).toEqual({});
    expect(sanitizeStyle({ offsets: {} })).toEqual({});
    expect(sanitizeStyle({ offsets: 5 })).toEqual({});
  });

  it('solo mueve en un eje si solo se manda ese', () => {
    expect(sanitizeStyle({ offsets: { recipient: { y: 30 } } })).toEqual({ offsets: { recipient: { x: 0, y: 30 } } });
  });
});
