/**
 * Convierte un título en una dirección de curso: minúsculas, sin tildes,
 * solo letras, números y guiones. Igual que el backend, para que lo que ves
 * al escribir sea lo que se guarda.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Misma regla que valida el backend (SLUG_PATTERN). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
