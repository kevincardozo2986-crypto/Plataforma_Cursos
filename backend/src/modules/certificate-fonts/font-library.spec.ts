import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as fontkit from 'fontkit';

import { missingChars } from './font-files.js';
import {
  customFontId,
  customKey,
  fontsDir,
  isStandardKey,
  libraryFilePath,
  libraryFont,
  loadLibrary,
} from './font-library.js';

describe('biblioteca de tipografías', () => {
  const library = loadLibrary();

  it('trae al menos 20 tipografías, con claves únicas y categorías conocidas', () => {
    expect(library.length).toBeGreaterThanOrEqual(20);
    expect(new Set(library.map((font) => font.key)).size).toBe(library.length);
    expect(new Set(library.map((font) => font.category))).toEqual(new Set(['Sans', 'Serif', 'Cursiva', 'Título']));
  });

  it('hay de cada categoría, para que el docente tenga de dónde elegir', () => {
    for (const category of ['Sans', 'Serif', 'Cursiva', 'Título']) {
      expect(library.filter((font) => font.category === category).length).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(library.map((font) => [font.label, font] as const))('%s: los archivos existen y se pueden abrir', (_label, font) => {
    for (const name of [font.regular, font.bold].filter((value): value is string => value !== null)) {
      const path = join(fontsDir(), name);

      expect(existsSync(path)).toBe(true);
      expect(() => fontkit.create(readFileSync(path))).not.toThrow();
    }
  });

  it.each(library.map((font) => [font.label, font] as const))('%s dibuja todas las letras del español, «», ¿ y ¡', (_label, font) => {
    for (const name of [font.regular, font.bold].filter((value): value is string => value !== null)) {
      const opened = fontkit.create(readFileSync(join(fontsDir(), name))) as { hasGlyphForCodePoint(cp: number): boolean };

      expect(missingChars(opened, 'áéíóúüñÁÉÍÓÚÜÑ¿¡«»“”.,:;()')).toEqual([]);
    }
  });

  it('libraryFont encuentra por clave', () => {
    expect(libraryFont('playfair-display')?.label).toBe('Playfair Display');
    expect(libraryFont('no-existe')).toBeUndefined();
  });

  it('el archivo de una tipografía solo se sirve si está en el manifiesto (no se puede salir de la carpeta)', () => {
    const real = library[0].regular;

    expect(libraryFilePath(real)).toBe(join(fontsDir(), real));
    for (const attack of ['../../.env', '..\\..\\.env', 'manifest.json', '/etc/passwd', 'LICENSES.txt', '', real + '/../../x']) {
      expect(libraryFilePath(attack)).toBeNull();
    }
  });
});

describe('claves de tipografía', () => {
  it('SANS y SERIF son las del PDF', () => {
    expect(isStandardKey('SANS')).toBe(true);
    expect(isStandardKey('SERIF')).toBe(true);
    expect(isStandardKey('lora')).toBe(false);
  });

  it('custom:<id> es una tipografía subida', () => {
    expect(customFontId('custom:12')).toBe(12);
    expect(customKey(12)).toBe('custom:12');
    for (const bad of ['custom:', 'custom:abc', 'custom:-1', 'custom:1.5', 'Custom:3', 'lora', 'custom:12; DROP TABLE']) {
      expect(customFontId(bad)).toBeNull();
    }
  });
});
