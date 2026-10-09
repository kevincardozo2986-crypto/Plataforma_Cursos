import { randomInt } from 'node:crypto';

/** Marcadores que se pueden usar en el texto de una plantilla: `{{student}}`, `{{course}}`… */
export const PLACEHOLDERS = [
  'student',
  'course',
  'date',
  'hours',
  'instructor',
] as const;

export type Placeholder = (typeof PLACEHOLDERS)[number];

export const DEFAULT_TITLE = 'Certificado de finalización';

export const DEFAULT_BODY =
  'Por haber completado satisfactoriamente el curso «{{course}}», impartido por {{instructor}}, el {{date}}.';

const PLACEHOLDER_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

/** Marcadores del texto que no existen (para avisar al docente de un error de escritura). */
export function findUnknownPlaceholders(text: string): string[] {
  const unknown = new Set<string>();

  for (const [, name] of text.matchAll(PLACEHOLDER_PATTERN)) {
    if (!(PLACEHOLDERS as readonly string[]).includes(name)) {
      unknown.add(name);
    }
  }

  return [...unknown];
}

/** Reemplaza los marcadores conocidos; los desconocidos se dejan tal cual. */
export function fillTemplate(
  text: string,
  values: Record<Placeholder, string>,
): string {
  return text.replace(PLACEHOLDER_PATTERN, (whole, name: string) =>
    name in values ? values[name as Placeholder] : whole,
  );
}

/** "45 minutos", "1 hora", "1,5 horas", "20 horas". Sin duración devuelve un texto vacío. */
export function formatHours(minutes: number | null): string {
  if (!minutes || minutes <= 0) {
    return '';
  }

  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  }

  const hours = Math.round((minutes / 60) * 10) / 10;
  const text = String(hours).replace('.', ',');

  return `${text} ${hours === 1 ? 'hora' : 'horas'}`;
}

/** "9 de octubre de 2026". */
export function formatLongDate(date: Date, timeZone = 'America/Bogota'): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(date);
}

/** Sin 0, O, 1, I ni L: no se confunden al leerlos o dictarlos. */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** `CC-` más tres grupos de 4. Con 31 símbolos hay unos 8×10¹⁷ códigos: no se pueden adivinar. */
export const CODE_PATTERN = /^CC-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;

export function generateCode(): string {
  const group = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

  return `CC-${group()}-${group()}-${group()}`;
}

/** Acepta el código en minúsculas o con espacios; devuelve null si no tiene la forma correcta. */
export function normalizeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();

  return CODE_PATTERN.test(code) ? code : null;
}

/** Un nombre de archivo seguro y legible: "certificado-curso-de-angular.pdf". */
export function pdfFileName(courseTitle: string): string {
  const slug = courseTitle
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return `certificado-${slug || 'curso'}.pdf`;
}
