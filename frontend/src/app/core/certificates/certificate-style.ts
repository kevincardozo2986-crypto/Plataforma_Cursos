import { CertificateStyle, FontOption, TextStyle } from './certificates.models';

export const SIZE_MIN = 60;
export const SIZE_MAX = 140;

/** Qué es la negrita "automática" de cada texto: título y nombre sí, el texto no (igual que el PDF). */
export const AUTO_BOLD = { title: true, name: true, body: false } as const;

export type StyledPart = keyof typeof AUTO_BOLD;

export interface ResolvedText {
  bold: boolean;
  /** Se pide negrita pero la tipografía no la tiene: se dibuja engrosada. */
  synthetic: boolean;
  italic: boolean;
  /** 0.6–1.4. */
  scale: number;
  color: string | null;
}

/** Lo que de verdad se aplica a un texto (misma regla que el servidor). */
export function resolveText(
  style: TextStyle | undefined,
  auto: boolean,
  font: Pick<FontOption, 'hasBold'> | undefined,
): ResolvedText {
  const hasBold = font?.hasBold ?? true;
  const bold = style?.bold ?? (auto && hasBold);
  const size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(style?.size ?? 100)));

  return {
    bold,
    synthetic: bold && !hasBold,
    italic: style?.italic === true,
    scale: size / 100,
    color: style?.color && /^#[0-9A-Fa-f]{6}$/.test(style.color) ? style.color : null,
  };
}

/** Lo que se envía al guardar: solo lo que difiere del diseño (igual que sanitizeStyle del servidor). */
export function cleanStyle(style: CertificateStyle): CertificateStyle {
  const clean: CertificateStyle = {};

  for (const part of ['title', 'name', 'body'] as const) {
    const { bold, italic, size, color } = style[part] ?? {};
    const text: TextStyle = {};

    if (typeof bold === 'boolean') text.bold = bold;
    if (italic === true) text.italic = true;
    if (typeof size === 'number' && Math.round(size) !== 100) {
      text.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(size)));
    }
    if (color && /^#[0-9A-Fa-f]{6}$/.test(color)) text.color = color.toUpperCase();

    if (Object.keys(text).length > 0) clean[part] = text;
  }

  if (style.showDocument === false) clean.showDocument = false;

  return clean;
}
