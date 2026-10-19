const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * El texto de un HTML, sin etiquetas, para mostrarlo en un resumen (tarjetas, listas). Los
 * párrafos y saltos de línea pasan a un espacio. Los videos, imágenes y scripts no dejan nada.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) {
    return '';
  }

  return html
    .replace(/<(script|style|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, (entity) => ENTITIES[entity])
    .replace(/\s+/g, ' ')
    .trim();
}
