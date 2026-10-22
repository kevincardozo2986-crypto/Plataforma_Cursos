/**
 * El estilo que el docente le da a cada texto del certificado, además de la tipografía.
 * Todo es opcional: lo que falta toma el valor por defecto del diseño.
 */
export interface TextStyle {
  /**
   * true = negrita, false = sin negrita, null o ausente = automática (negrita si la tipografía
   * tiene negrita de verdad; si no, normal). Forzarla en una tipografía sin negrita la dibuja
   * con un trazo fino (negrita sintética).
   */
  bold?: boolean | null;
  /** Cursiva sintética: se inclina el texto (las tipografías no traen su versión cursiva). */
  italic?: boolean;
  /** Tamaño como porcentaje del normal (60–140). */
  size?: number;
  /** Color en hexadecimal; null o ausente = el del diseño. */
  color?: string | null;
}

/** Los bloques de texto que se pueden mover. «recipient» es «Se otorga a», el nombre, la cédula y la línea. */
export const OFFSET_PARTS = ['title', 'recipient', 'body', 'signature'] as const;
export type OffsetPart = (typeof OFFSET_PARTS)[number];

/** Cuánto se corrió un bloque desde su sitio, en puntos de página (A4 horizontal: 841,89 × 595,28). */
export interface Offset {
  x: number;
  y: number;
}

export const OFFSET_MAX_X = 400;
export const OFFSET_MAX_Y = 300;

export interface CertificateStyle {
  title?: TextStyle;
  name?: TextStyle;
  body?: TextStyle;
  /** Mostrar la cédula bajo el nombre (por defecto sí). */
  showDocument?: boolean;
  /**
   * Velo blanco semitransparente detrás del texto, en porcentaje (0–80). Sirve cuando el fondo es una
   * imagen propia y el texto no se lee bien. Por defecto, sin velo.
   */
  veil?: number;
  /** Dónde está cada bloque de texto respecto a su sitio original; lo que falta, no se movió. */
  offsets?: Partial<Record<OffsetPart, Offset>>;
}

export const SIZE_MIN = 60;
export const SIZE_MAX = 140;
export const VEIL_MAX = 80;
export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Qué es la negrita "automática" de cada texto: título y nombre sí, el texto no. */
export const AUTO_BOLD = { title: true, name: true, body: false } as const;

export interface ResolvedText {
  /** Se pide negrita. */
  bold: boolean;
  /** Se pide negrita pero la tipografía no la tiene: se dibuja con un trazo. */
  syntheticBold: boolean;
  italic: boolean;
  /** 0.6–1.4. */
  scale: number;
  color: string | null;
}

/** Lo que de verdad se aplica a un texto, dado su estilo y si su tipografía tiene negrita real. */
export function resolveText(
  style: TextStyle | undefined,
  auto: boolean,
  hasRealBold: boolean,
): ResolvedText {
  // Automática: negrita solo si el texto la lleva por defecto Y la tipografía la tiene.
  const bold = style?.bold ?? (auto && hasRealBold);

  return {
    bold,
    syntheticBold: bold && !hasRealBold,
    italic: style?.italic === true,
    scale: clampSize(style?.size) / 100,
    color: style?.color && HEX_COLOR.test(style.color) ? style.color : null,
  };
}

function clampSize(size: unknown): number {
  const value = typeof size === 'number' && Number.isFinite(size) ? Math.round(size) : 100;

  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, value));
}

const clampOffset = (value: unknown, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(-max, Math.round(value))) : 0;

/** Solo los bloques conocidos, con números enteros acotados; un bloque sin mover no se guarda. */
function cleanOffsets(raw: unknown): CertificateStyle['offsets'] | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const clean: Partial<Record<OffsetPart, Offset>> = {};

  for (const part of OFFSET_PARTS) {
    const { x, y } = ((raw as Record<string, unknown>)[part] ?? {}) as Record<string, unknown>;
    const offset = { x: clampOffset(x, OFFSET_MAX_X), y: clampOffset(y, OFFSET_MAX_Y) };

    if (offset.x !== 0 || offset.y !== 0) {
      clean[part] = offset;
    }
  }

  return Object.keys(clean).length > 0 ? clean : undefined;
}

function cleanText(raw: unknown): TextStyle | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const { bold, italic, size, color } = raw as Record<string, unknown>;
  const clean: TextStyle = {};

  if (typeof bold === 'boolean') {
    clean.bold = bold;
  }
  if (italic === true) {
    clean.italic = true;
  }
  if (typeof size === 'number' && Number.isFinite(size) && Math.round(size) !== 100) {
    clean.size = clampSize(size);
  }
  if (typeof color === 'string' && HEX_COLOR.test(color)) {
    clean.color = color.toUpperCase();
  }

  return Object.keys(clean).length > 0 ? clean : undefined;
}

/**
 * Deja solo lo válido de un estilo leído de la base de datos o recibido: valores inventados se
 * descartan, los tamaños se acotan y lo que es igual al valor por defecto no se guarda.
 */
export function sanitizeStyle(raw: unknown): CertificateStyle {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const { title, name, body, showDocument, veil, offsets } = raw as Record<string, unknown>;
  const clean: CertificateStyle = {};

  for (const [key, value] of [['title', title], ['name', name], ['body', body]] as const) {
    const text = cleanText(value);

    if (text) {
      clean[key] = text;
    }
  }

  if (showDocument === false) {
    clean.showDocument = false;
  }

  const moved = cleanOffsets(offsets);

  if (moved) {
    clean.offsets = moved;
  }

  if (typeof veil === 'number' && Number.isFinite(veil) && Math.round(veil) > 0) {
    clean.veil = Math.min(VEIL_MAX, Math.round(veil));
  }

  return clean;
}
