import { FontCategory, FontOption } from './certificates.models';

/** El nombre con el que se registra una tipografía en el navegador (`@font-face`). */
export function familyName(key: string): string {
  return `cf-${key.replace(/[^a-zA-Z0-9-]/g, '-')}`;
}

/** Qué se usa mientras la tipografía carga (o si no carga): algo parecido. */
const FALLBACK: Record<FontCategory, string> = {
  Sans: 'Helvetica, Arial, sans-serif',
  Serif: "'Times New Roman', Times, serif",
  Cursiva: 'cursive',
  Título: 'Georgia, serif',
  Mía: 'Helvetica, Arial, sans-serif',
};

/** El valor de `font-family` para una tipografía; sin ella (aún no cargó el catálogo), Helvetica. */
export function cssFamily(option: Pick<FontOption, 'key' | 'category'> | undefined): string {
  if (!option) {
    return FALLBACK.Sans;
  }

  // Helvetica y Times son del propio PDF: en pantalla se usan las del sistema.
  if (option.key === 'SANS' || option.key === 'SERIF') {
    return FALLBACK[option.category];
  }

  return `'${familyName(option.key)}', ${FALLBACK[option.category]}`;
}

/** 700 solo si se pide negrita y la tipografía la tiene; si no, el PDF usa la normal y la pantalla también. */
export function cssWeight(
  option: Pick<FontOption, 'hasBold'> | undefined,
  bold: boolean,
): 400 | 700 {
  return bold && (option?.hasBold ?? true) ? 700 : 400;
}

/**
 * El mayor tamaño (hasta `start`) con el que `text` cabe en `maxWidth`, sin bajar de `min`.
 * `widthAt` mide el texto a un tamaño dado. Es la misma regla que aplica el PDF: se va achicando.
 */
export function fitToWidth(
  start: number,
  maxWidth: number,
  min: number,
  widthAt: (size: number) => number,
): number {
  let size = start;

  while (size > min && widthAt(size) > maxWidth) {
    size -= 1;
  }

  return size;
}

export const MAX_FONT_BYTES = 2 * 1024 * 1024;

/**
 * Lo que se puede revisar de una tipografía antes de subirla (el servidor la vuelve a revisar
 * de verdad): formato por la extensión y peso. null = parece bien.
 */
export function fontFileProblem(file: { name: string; size: number }): string | null {
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) {
    return 'Elige un archivo .ttf, .otf, .woff o .woff2.';
  }

  if (file.size <= 0) {
    return 'El archivo está vacío.';
  }

  return file.size > MAX_FONT_BYTES ? 'La tipografía pesa demasiado (máximo 2 MB).' : null;
}
