import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanFontName, detectFormat, inspectFont, missingChars, REQUIRED_CHARS } from './font-files.js';
import { fontsDir } from './font-library.js';

const sample = () => readFileSync(join(fontsDir(), 'lora-regular.woff'));

describe('detectFormat', () => {
  it('reconoce cada formato por sus primeros bytes', () => {
    expect(detectFormat(Buffer.from('wOFF....'))).toBe('woff');
    expect(detectFormat(Buffer.from('wOF2....'))).toBe('woff2');
    expect(detectFormat(Buffer.from('OTTO....'))).toBe('otf');
    expect(detectFormat(Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00]))).toBe('ttf');
    expect(detectFormat(Buffer.from('true....'))).toBe('ttf');
  });

  it('rechaza colecciones, texto, imágenes, ejecutables y vacíos', () => {
    expect(detectFormat(Buffer.from('ttcf....'))).toBeNull();
    expect(detectFormat(Buffer.from('hola, esto no es una tipografía'))).toBeNull();
    expect(detectFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG
    expect(detectFormat(Buffer.from('MZ\x90\x00'))).toBeNull(); // .exe
    expect(detectFormat(Buffer.from('<svg'))).toBeNull();
    expect(detectFormat(Buffer.alloc(0))).toBeNull();
    expect(detectFormat(Buffer.from([0x00, 0x01]))).toBeNull();
  });

  it('la tipografía de la biblioteca se reconoce como woff', () => {
    expect(detectFormat(sample())).toBe('woff');
  });
});

describe('inspectFont', () => {
  it('una tipografía real: dice su familia y que no le falta nada', () => {
    const result = inspectFont(sample());

    expect(result.family).toMatch(/lora/i);
    expect(result.missing).toEqual([]);
  });

  it('un archivo dañado o que solo empieza como tipografía lanza un error', () => {
    expect(() => inspectFont(Buffer.from('wOFF' + 'x'.repeat(200)))).toThrow();
    expect(() => inspectFont(sample().subarray(0, 300))).toThrow();
    expect(() => inspectFont(Buffer.from('texto cualquiera'))).toThrow();
  });
});

describe('missingChars', () => {
  it('lista lo que la tipografía no dibuja, sin repetir', () => {
    const font = { hasGlyphForCodePoint: (cp: number) => !'ñÑú'.includes(String.fromCodePoint(cp)) };

    expect(missingChars(font)).toEqual(['ú', 'ñ', 'Ñ'].filter((c) => REQUIRED_CHARS.includes(c)).sort((a, b) => REQUIRED_CHARS.indexOf(a) - REQUIRED_CHARS.indexOf(b)));
    expect(missingChars(font, 'ñññ')).toEqual(['ñ']);
  });

  it('una tipografía completa no tiene faltantes', () => {
    expect(missingChars({ hasGlyphForCodePoint: () => true })).toEqual([]);
  });
});

describe('cleanFontName', () => {
  it('quita símbolos y espacios de más', () => {
    expect(cleanFontName('  Mi   Tipografía <b>Bonita</b>  ', 'x')).toBe('Mi Tipografía b Bonita b');
  });

  it('sin nombre usa el de la familia, y si tampoco, uno genérico', () => {
    expect(cleanFontName(undefined, 'Lora Regular')).toBe('Lora Regular');
    expect(cleanFontName('   ', '')).toBe('Mi tipografía');
    expect(cleanFontName('<<>>', '###')).toBe('Mi tipografía');
  });

  it('no pasa de 60 caracteres', () => {
    expect(cleanFontName('a'.repeat(200), 'x')).toHaveLength(60);
  });
});
