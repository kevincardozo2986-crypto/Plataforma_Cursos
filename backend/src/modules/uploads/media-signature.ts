export type MediaKind = 'image' | 'video';

export interface DetectedMedia {
  kind: MediaKind;
  /** Extensiones que puede llevar un archivo con esta firma. */
  extensions: string[];
}

/** Bytes que hay que leer del inicio de un archivo para reconocerlo. */
export const SIGNATURE_BYTES = 16;

/**
 * Reconoce un imagen o video por sus primeros bytes, sin fiarse del nombre ni del
 * tipo que declara el navegador. Devuelve null si no es un formato permitido.
 */
export function detectMedia(head: Buffer): DetectedMedia | null {
  if (head.length < 12) {
    return null;
  }

  const text = (from: number, to: number) => head.toString('latin1', from, to);

  // Imágenes
  if (head[0] === 0x89 && text(1, 4) === 'PNG') {
    return { kind: 'image', extensions: ['png'] };
  }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { kind: 'image', extensions: ['jpg', 'jpeg'] };
  }
  if (text(0, 4) === 'GIF8') {
    return { kind: 'image', extensions: ['gif'] };
  }
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') {
    return { kind: 'image', extensions: ['webp'] };
  }

  // Videos
  if (text(4, 8) === 'ftyp') {
    return { kind: 'video', extensions: ['mp4', 'mov'] };
  }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return { kind: 'video', extensions: ['webm'] };
  }
  if (text(0, 4) === 'OggS') {
    return { kind: 'video', extensions: ['ogv', 'ogg'] };
  }

  return null;
}

/** Extensiones permitidas al elegir el archivo, según lo que se sube. */
export const ALLOWED_EXTENSIONS: Record<MediaKind, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
  video: ['mp4', 'mov', 'webm', 'ogv', 'ogg'],
};
