import { Transform } from 'class-transformer';
import sanitize from 'sanitize-html';

/**
 * Un `<iframe>` puede apuntar a cualquier sitio (con `https://`): videos, presentaciones, páginas
 * propias de la institución, aplicaciones… Lo que sí se impide:
 * - Direcciones que no sean `https://` absolutas (sin `javascript:`, `data:`, `http:`, relativas ni
 *   `//otro-sitio`): se elimina el marco entero.
 * - Marcos que apunten a esta misma plataforma (su dirección o `localhost`): con `allow-same-origin`
 *   podrían leer la sesión de quien los ve.
 * - Todo marco queda aislado con `sandbox` (ver IFRAME_SANDBOX): sin navegar la página, sin formularios.
 */
const OWN_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Direcciones de esta plataforma, para no permitir que un marco la cargue dentro de sí misma. */
function ownHostnames(): Set<string> {
  const hosts = new Set(OWN_HOSTS);

  for (const value of [process.env.APP_URL, process.env.API_URL, process.env.PUBLIC_URL]) {
    try {
      if (value) {
        hosts.add(new URL(value).hostname.toLowerCase());
      }
    } catch {
      // Un valor mal escrito en el entorno simplemente no suma ninguna dirección.
    }
  }

  return hosts;
}

/** ¿El marco apunta a esta misma plataforma, a un nombre sin punto o a una dirección ilegible? */
export function isOwnOrigin(src: string): boolean {
  try {
    const host = new URL(src).hostname.toLowerCase();

    // Un nombre sin punto («hola», «intranet») no es un sitio de internet.
    return !host.includes('.') || ownHostnames().has(host);
  } catch {
    return true;
  }
}

/** Lo que se le impone a todo marco incrustado, diga lo que diga el HTML original. */
const IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups';

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
    iframe: [
      'src',
      'width',
      'height',
      'title',
      'allowfullscreen',
      'frameborder',
      'sandbox',
      'loading',
      'referrerpolicy',
    ],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
    // El estilo solo se admite para alinear el texto (ver allowedStyles).
    '*': ['title', 'style'],
  },
  allowedStyles: {
    '*': { 'text-align': [/^(left|right|center|justify)$/] },
  },
  // Sin javascript:, data: ni otros esquemas; los enlaces relativos (/api/uploads/...) pasan.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'], iframe: ['https'] },
  // Un marco con dirección relativa (/api/…) cargaría esta misma plataforma.
  allowIframeRelativeUrls: false,
  allowProtocolRelative: false,
  transformTags: {
    // Todo marco queda aislado y con carga diferida, aunque el HTML traiga otros valores.
    iframe: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        sandbox: IFRAME_SANDBOX,
        loading: 'lazy',
        referrerpolicy: 'strict-origin-when-cross-origin',
      },
    }),
    // Los enlaces que abren otra pestaña no deben poder controlar la página de origen.
    a: (tagName, attribs) => ({
      tagName,
      attribs: attribs.target
        ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' }
        : attribs,
    }),
  },
  // Un iframe sin dirección válida, o que apunta a esta plataforma, se quita entero.
  exclusiveFilter: (frame) =>
    frame.tag === 'iframe' && (!frame.attribs.src || isOwnOrigin(frame.attribs.src)),
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
