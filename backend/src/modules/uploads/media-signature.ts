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

/** Material de una lección que no es imagen ni video: PDF y audio. */
export const MATERIAL_EXTENSIONS = ['pdf', 'mp3', 'm4a', 'wav', 'aac', 'flac', 'ogg'];

/**
 * Reconoce un PDF o un audio por sus primeros bytes. Devuelve las extensiones que puede llevar
 * (null si no es un formato permitido). Un .ogg puede ser audio (Vorbis/Opus) o video: aquí se acepta como audio.
 */
export function detectMaterial(head: Buffer): string[] | null {
  if (head.length < 12) {
    return null;
  }

  const text = (from: number, to: number) => head.toString('latin1', from, to);

  if (text(0, 5) === '%PDF-') return ['pdf'];
  if (text(0, 3) === 'ID3') return ['mp3'];
  // 11 bits de sincronía: con «layer» 00 es un cuadro ADTS (aac); con otro valor, un cuadro MPEG de audio (mp3 sin etiqueta).
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
    return (head[1] & 0x06) === 0 ? ['aac'] : ['mp3'];
  }
  if (text(4, 8) === 'ftyp' && (text(8, 12) === 'M4A ' || text(8, 12) === 'M4B ')) return ['m4a'];
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE') return ['wav'];
  if (text(0, 4) === 'fLaC') return ['flac'];
  if (text(0, 4) === 'OggS') return ['ogg'];

  return null;
}
