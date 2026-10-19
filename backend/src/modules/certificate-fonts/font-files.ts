import * as fontkit from 'fontkit';

export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2';

/** Pesa poco: una tipografía normal ronda los 100–500 KB. */
export const MAX_FONT_BYTES = 2 * 1024 * 1024;

/** Cuántas tipografías propias puede tener cada docente. */
export const MAX_CUSTOM_FONTS = 20;

/** Lo que un certificado en español necesita dibujar con cualquier tipografía. */
export const REQUIRED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzáéíóúüñÁÉÍÓÚÜÑ0123456789 .,-';

/**
 * El formato real, por los primeros bytes (no se confía en la extensión). Las colecciones
 * (.ttc) y cualquier otra cosa dan null.
 */
export function detectFormat(head: Buffer): FontFormat | null {
  const tag = head.subarray(0, 4).toString('latin1');

  if (tag === 'wOFF') {
    return 'woff';
  }
  if (tag === 'wOF2') {
    return 'woff2';
  }
  if (tag === 'OTTO') {
    return 'otf';
  }

  // TrueType: versión 1.0 (00 01 00 00) o la etiqueta «true» de las antiguas de Apple.
  return head.length >= 4 && (head.readUInt32BE(0) === 0x00010000 || tag === 'true') ? 'ttf' : null;
}

/** Los caracteres de `chars` que la tipografía no sabe dibujar. */
export function missingChars(
  font: { hasGlyphForCodePoint(codePoint: number): boolean },
  chars: string = REQUIRED_CHARS,
): string[] {
  return [...new Set(chars)].filter((char) => !font.hasGlyphForCodePoint(char.codePointAt(0) as number));
}

export interface FontInspection {
  /** El nombre de la familia dentro del archivo (para ofrecerlo como nombre). */
  family: string;
  missing: string[];
}

/** Abre la tipografía de verdad: un archivo dañado o falso lanza un error. */
export function inspectFont(buffer: Buffer): FontInspection {
  const opened = fontkit.create(buffer);

  // Una colección trae varias tipografías; no se admiten.
  if (!('hasGlyphForCodePoint' in opened)) {
    throw new Error('colección de tipografías');
  }

  return { family: opened.familyName ?? '', missing: missingChars(opened) };
}

/** Nombre limpio para mostrar: sin saltos ni símbolos raros, hasta 60 caracteres. */
export function cleanFontName(raw: string | undefined, fallback: string): string {
  const name = (raw ?? '').replace(/[^\p{L}\p{N} ._-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

  return name || fallback.replace(/[^\p{L}\p{N} ._-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Mi tipografía';
}

export const FONT_MIME: Record<FontFormat, string> = {
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};
