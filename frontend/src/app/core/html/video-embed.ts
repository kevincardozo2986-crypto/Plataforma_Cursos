import { countIframes, isAllowedEmbedUrl, sanitizeHtml } from './html-safe';

export interface Embed {
  /** Dirección lista para el `src` de un iframe (siempre de un sitio permitido). */
  src: string;
  provider: 'youtube' | 'vimeo' | 'loom' | 'dailymotion' | 'other';
}

const YOUTUBE_ID = /^[\w-]{11}$/;
const NUMERIC_ID = /^\d+$/;
const WORD_ID = /^[\w-]+$/;

function parse(input: string): URL | null {
  const text = input.trim();

  if (!text || /\s/.test(text)) {
    return null;
  }

  try {
    return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
}

/** El primer tramo de la ruta que parezca un identificador, tras `marker` si se da. */
function idAfter(url: URL, marker: string | null): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  const index = marker === null ? 0 : parts.indexOf(marker) + 1;

  return marker !== null && index === 0 ? null : (parts[index] ?? null);
}

/**
 * Convierte el enlace de un video (el de la barra de direcciones o el de «compartir») a su
 * dirección de incrustar. Reconoce YouTube, Vimeo, Loom y Dailymotion; además acepta una
 * dirección https de cualquier otro sitio permitido (por ejemplo una presentación de Google).
 * Devuelve null si no es un video reconocible o el sitio no está permitido.
 */
export function toEmbed(input: string): Embed | null {
  const url = parse(input);

  if (!url) {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id =
      host === 'youtu.be'
        ? idAfter(url, null)
        : (url.searchParams.get('v') ??
          idAfter(url, 'embed') ??
          idAfter(url, 'shorts') ??
          idAfter(url, 'live'));

    return id && YOUTUBE_ID.test(id)
      ? { src: `https://www.youtube-nocookie.com/embed/${id}`, provider: 'youtube' }
      : null;
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    const id = [...parts].reverse().find((part) => NUMERIC_ID.test(part));

    return id ? { src: `https://player.vimeo.com/video/${id}`, provider: 'vimeo' } : null;
  }

  if (host === 'loom.com') {
    const id = idAfter(url, 'share') ?? idAfter(url, 'embed');

    return id && WORD_ID.test(id)
      ? { src: `https://www.loom.com/embed/${id}`, provider: 'loom' }
      : null;
  }

  if (host === 'dailymotion.com') {
    const id = idAfter(url, 'video') ?? idAfter(url, 'embed');

    return id && WORD_ID.test(id)
      ? {
          src: `https://www.dailymotion.com/embed/video/${id.split('_')[0]}`,
          provider: 'dailymotion',
        }
      : null;
  }

  // Otro sitio permitido: solo si ya es una dirección https de las de la lista.
  return isAllowedEmbedUrl(url.href) ? { src: url.href, provider: 'other' } : null;
}

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** El <iframe> estándar para una dirección de incrustar. */
export function iframeHtml(src: string, title = 'Video'): string {
  return (
    `<iframe src="${escapeAttribute(src)}" width="560" height="315" ` +
    `title="${escapeAttribute(title)}" frameborder="0" allowfullscreen></iframe>`
  );
}

/**
 * Lo que el docente pega al «Insertar video»: un enlace, o el código <iframe …> que da el sitio.
 * Devuelve el HTML a insertar, o el motivo por el que no se puede.
 */
export function embedFromInput(input: string): { html: string } | { error: string } {
  const text = input.trim();

  if (!text) {
    return { error: 'Pega el enlace del video o el código para incrustar.' };
  }

  if (/<iframe\b/i.test(text)) {
    const clean = sanitizeHtml(text);

    // Si el sitio no está permitido, la limpieza lo elimina por completo.
    return countIframes(clean) > 0
      ? { html: clean }
      : {
          error:
            'Ese sitio no está permitido para incrustar. Usa YouTube, Vimeo, Loom, Dailymotion, ' +
            'Google Drive o Docs, Canva, CodePen o Genially.',
        };
  }

  const embed = toEmbed(text);

  return embed
    ? { html: iframeHtml(embed.src) }
    : {
        error:
          'No reconocemos ese enlace. Pega el de un video de YouTube, Vimeo, Loom o Dailymotion, ' +
          'o el código <iframe> de un sitio permitido.',
      };
}
