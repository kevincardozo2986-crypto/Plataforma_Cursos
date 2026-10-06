import { Transform } from 'class-transformer';
import sanitize from 'sanitize-html';

/** Videos que se pueden incrustar con <iframe>. Cualquier otro sitio se descarta. */
const IFRAME_HOSTS = [
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
];

const OPTIONS: sanitize.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'div', 'span',
    'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark', 'small',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
    'iframe',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    iframe: ['src', 'width', 'height', 'title', 'allowfullscreen', 'frameborder'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
    '*': ['title'],
  },
  // Sin javascript:, data: ni otros esquemas; los enlaces relativos (/api/uploads/...) pasan.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  allowedIframeHostnames: IFRAME_HOSTS,
  transformTags: {
    // Los enlaces que abren otra pestaña no deben poder controlar la página de origen.
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.target
        ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' }
        : attribs,
    }),
  },
  // Un iframe de un sitio no permitido pierde su src: se quita entero.
  exclusiveFilter: (frame) => frame.tag === 'iframe' && !frame.attribs.src,
  // <script> y <style> se eliminan con su contenido, no solo la etiqueta.
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
};

/** Deja solo el HTML seguro de un texto. Un <script> o un onclick="…" desaparecen. */
export function cleanHtml(value: string): string {
  return sanitize(value, OPTIONS).trim();
}

/** ¿Queda algún texto visible? `<p></p>` o `<p><br></p>` cuentan como vacío. */
export function hasVisibleText(html: string): boolean {
  return (
    sanitize(html, { allowedTags: [], allowedAttributes: {} })
      .replace(/&nbsp;/g, ' ')
      .trim() !== ''
  );
}

/**
 * Para campos donde el docente puede escribir HTML (descripciones, contenido de lecciones).
 * Se limpia al recibirlo, así lo guardado ya es seguro para mostrar con innerHTML.
 */
export const SanitizeHtml = () =>
  Transform(({ value }) => (typeof value === 'string' ? cleanHtml(value) : value));
