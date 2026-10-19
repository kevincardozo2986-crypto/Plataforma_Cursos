import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tipografías que vienen con la plataforma (licencia SIL OFL, ver assets/certificate-fonts/LICENSES.txt).
 * Los archivos van en `assets/certificate-fonts` junto con un `manifest.json`; se pueden poner en
 * otra carpeta con la variable de entorno FONTS_DIR.
 */
export interface LibraryFont {
  /** Identificador estable, por ejemplo "playfair-display". Es lo que guarda la plantilla. */
  key: string;
  label: string;
  category: 'Sans' | 'Serif' | 'Cursiva' | 'Título' | 'Mono';
  /** Nombres de archivo dentro de la carpeta de tipografías. */
  regular: string;
  /** null si la tipografía no tiene negrita (los títulos usan entonces la normal). */
  bold: string | null;
}

/** Las dos que trae el PDF sin incrustar nada. */
export const STANDARD_FONTS = [
  { key: 'SANS', label: 'Helvetica', category: 'Sans', regular: 'Helvetica', bold: 'Helvetica-Bold' },
  { key: 'SERIF', label: 'Times', category: 'Serif', regular: 'Times-Roman', bold: 'Times-Bold' },
] as const;

export const DEFAULT_FONT = 'SANS';

/** `custom:12` es una tipografía que subió un docente. */
const CUSTOM_KEY = /^custom:(\d{1,9})$/;

export function fontsDir(): string {
  return process.env.FONTS_DIR ?? join(process.cwd(), 'assets', 'certificate-fonts');
}

let cache: LibraryFont[] | null = null;

export function loadLibrary(): LibraryFont[] {
  cache ??= JSON.parse(readFileSync(join(fontsDir(), 'manifest.json'), 'utf8')) as LibraryFont[];

  return cache;
}

/** Solo para las pruebas: vuelve a leer el manifiesto. */
export function resetLibraryCache(): void {
  cache = null;
}

export function libraryFont(key: string): LibraryFont | undefined {
  return loadLibrary().find((font) => font.key === key);
}

export function isStandardKey(key: string): boolean {
  return STANDARD_FONTS.some((font) => font.key === key);
}

/** El id de una tipografía subida (`custom:12` → 12), o null si la clave no es de ese tipo. */
export function customFontId(key: string): number | null {
  const match = CUSTOM_KEY.exec(key);

  return match ? Number(match[1]) : null;
}

export const customKey = (id: number): string => `custom:${id}`;

/**
 * La ruta de un archivo de la biblioteca, solo si su nombre está en el manifiesto. Así un nombre
 * como `../../.env` jamás sale de la carpeta.
 */
export function libraryFilePath(name: string): string | null {
  const known = loadLibrary().some((font) => font.regular === name || font.bold === name);

  return known ? join(fontsDir(), name) : null;
}
