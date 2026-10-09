import { PLACEHOLDERS } from '../../../core/certificates/certificates.models';

const PATTERN = /\{\{\s*(\w+)\s*\}\}/g;
const KNOWN = PLACEHOLDERS.map((item) => item.token.replace(/[{}]/g, ''));

/** Marcadores mal escritos (p. ej. {{estudiante}}): el backend los rechaza, aquí se avisa antes. */
export function unknownPlaceholders(text: string): string[] {
  const found = new Set<string>();

  for (const [, name] of text.matchAll(PATTERN)) {
    if (!KNOWN.includes(name)) {
      found.add(name);
    }
  }

  return [...found];
}

/** Reemplaza los marcadores conocidos con datos de ejemplo; los demás se dejan como están. */
export function fillSample(text: string, values: Record<string, string>): string {
  return text.replace(PATTERN, (whole, name: string) => (name in values ? values[name] : whole));
}

/** Datos de ejemplo para la vista previa del editor. */
export function sampleValues(instructor: string): Record<string, string> {
  return {
    student: 'Nombre del Estudiante',
    course: 'Nombre del curso',
    date: new Intl.DateTimeFormat('es-CO', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date()),
    hours: '20 horas',
    instructor,
  };
}

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
