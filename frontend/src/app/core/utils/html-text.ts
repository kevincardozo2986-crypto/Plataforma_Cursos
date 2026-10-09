const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Texto escrito en una caja simple a HTML: una línea en blanco separa párrafos y un salto
 * de línea simple pasa a <br>. Todo lo que se escribe se escapa, así que no se cuela HTML.
 */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Lo contrario: HTML a texto simple para volver a editarlo. Pierde el formato (negritas, enlaces…). */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol|blockquote)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, (entity) => ENTITIES[entity])
    .replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/** ¿El HTML usa algo más que párrafos y saltos de línea? Editarlo como texto lo perdería. */
export function hasRichFormatting(html: string): boolean {
  return /<(?!\/?(?:p|br)\b)[a-z][^>]*>/i.test(html);
}
