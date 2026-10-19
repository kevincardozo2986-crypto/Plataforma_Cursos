/**
 * Limpieza de HTML en el navegador. Es el mismo criterio que aplica el servidor al guardar
 * (backend/src/common/dto/sanitize-html.ts): si cambias uno, cambia el otro.
 *
 * Sirve para que lo que el docente pega o escribe en la pestaña «Código» del editor no se
 * ejecute en su propia pantalla antes de guardarse, y para mostrarle ya lo que quedará.
 */

/** Sitios que se pueden incrustar con <iframe>. */
export const IFRAME_HOSTS = [
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'www.loom.com',
  'fast.wistia.net',
  'www.dailymotion.com',
  'drive.google.com',
  'docs.google.com',
  'www.canva.com',
  'codepen.io',
  'view.genial.ly',
];

export const IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups';

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'hr',
  'div',
  'span',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'sub',
  'sup',
  'mark',
  'small',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'a',
  'img',
  'figure',
  'figcaption',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'iframe',
]);

/** Estas etiquetas se descartan con todo su contenido; las demás no permitidas solo pierden la etiqueta. */
const DROP_WITH_CONTENT = new Set([
  'script',
  'style',
  'textarea',
  'option',
  'noscript',
  'template',
]);

const ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  iframe: ['src', 'width', 'height', 'title', 'allowfullscreen', 'frameborder'],
  th: ['colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
};

const TEXT_ALIGN = /^(left|right|center|justify)$/;

/** ¿Es una dirección segura para un enlace o una imagen? (sin javascript:, data:, ni //otro-sitio). */
export function isSafeUrl(
  value: string,
  protocols = ['http:', 'https:', 'mailto:', 'tel:'],
): boolean {
  const url = value.trim();

  if (/[\u0000-\u001f]/.test(url)) {
    return false;
  }

  // Ruta propia (/api/uploads/…) o ancla; «//» sería otro sitio.
  if (url.startsWith('/')) {
    return !url.startsWith('//');
  }

  if (url.startsWith('#')) {
    return true;
  }

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url);

  return !!scheme && protocols.includes(`${scheme[1].toLowerCase()}:`);
}

/** ¿Es un https:// de uno de los sitios permitidos para incrustar? */
export function isAllowedEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());

    return url.protocol === 'https:' && IFRAME_HOSTS.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Solo se conserva la alineación; cualquier otro estilo se descarta. */
function alignmentOf(style: string): string | null {
  const match = /(?:^|;)\s*text-align\s*:\s*([a-z]+)\s*(?:;|$)/i.exec(style);

  return match && TEXT_ALIGN.test(match[1].toLowerCase())
    ? `text-align:${match[1].toLowerCase()}`
    : null;
}

function copyAttributes(source: Element, target: Element, tag: string): boolean {
  const allowed = new Set([...(ATTRIBUTES[tag] ?? []), 'title', 'style']);

  for (const { name, value } of Array.from(source.attributes)) {
    const key = name.toLowerCase();

    if (!allowed.has(key)) {
      continue;
    }

    if (key === 'style') {
      const align = alignmentOf(value);

      if (align) {
        target.setAttribute('style', align);
      }
    } else if (key === 'href') {
      if (isSafeUrl(value)) {
        target.setAttribute('href', value);
      }
    } else if (key === 'src') {
      // Los marcos solo admiten los sitios de la lista; las imágenes, http(s) o una ruta propia.
      if (tag === 'iframe' ? isAllowedEmbedUrl(value) : isSafeUrl(value, ['http:', 'https:'])) {
        target.setAttribute('src', value);
      }
    } else {
      target.setAttribute(key, value);
    }
  }

  if (tag === 'a' && target.getAttribute('target')) {
    target.setAttribute('target', '_blank');
    target.setAttribute('rel', 'noopener noreferrer');
  }

  if (tag === 'iframe') {
    // Un marco sin dirección permitida no se conserva; los que quedan, aislados.
    if (!target.getAttribute('src')) {
      return false;
    }

    target.setAttribute('sandbox', IFRAME_SANDBOX);
    target.setAttribute('loading', 'lazy');
    target.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  }

  return true;
}

function walk(source: Node, target: Node, doc: Document): void {
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      target.appendChild(doc.createTextNode(child.textContent ?? ''));
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const element = child as Element;
    const tag = element.tagName.toLowerCase();

    if (DROP_WITH_CONTENT.has(tag)) {
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      // Etiqueta no permitida: se quita, pero su texto se conserva.
      walk(element, target, doc);
      continue;
    }

    const copy = doc.createElement(tag);

    if (!copyAttributes(element, copy, tag)) {
      continue;
    }

    walk(element, copy, doc);
    target.appendChild(copy);
  }
}

/** Deja solo el HTML seguro. Un <script>, un onclick o un marco de un sitio no permitido desaparecen. */
export function sanitizeHtml(html: string): string {
  // Sin DOM (prerenderizado en el servidor) no se puede analizar: mejor nada que algo inseguro.
  if (typeof DOMParser === 'undefined' || !html) {
    return '';
  }

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const output = parsed.createElement('div');

  walk(parsed.body, output, parsed);

  return output.innerHTML.trim();
}

/** ¿Hay algo que ver (texto, imagen, video o línea)? `<p><br></p>` cuenta como vacío. */
export function hasVisibleContent(html: string): boolean {
  if (/<(img|iframe|hr|table)\b/i.test(html)) {
    return true;
  }

  return (
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim() !== ''
  );
}

/** Cuántos marcos incrustados trae un HTML (para avisar si al limpiarlo se quitó alguno). */
export function countIframes(html: string): number {
  return (html.match(/<iframe\b/gi) ?? []).length;
}
