export type UploadKind = 'image' | 'video';

const MB = 1024 * 1024;

/** Mismos límites que el backend: así se avisa antes de gastar una subida larga. */
export const MAX_UPLOAD_BYTES: Record<UploadKind, number> = {
  image: 50 * MB,
  video: 500 * MB,
};

export const ALLOWED_EXTENSIONS: Record<UploadKind, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
  video: ['mp4', 'mov', 'webm', 'ogv', 'ogg'],
};

/** Valor para el atributo `accept` del selector de archivos. */
export const ACCEPT: Record<UploadKind, string> = {
  image: 'image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp',
  video: 'video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.mov,.webm,.ogv,.ogg',
};

const NAMES: Record<UploadKind, { thing: string; formats: string }> = {
  image: { thing: 'La imagen', formats: 'JPG, PNG, GIF o WebP' },
  video: { thing: 'El video', formats: 'MP4, WebM, MOV u OGG' },
};

/** "12,3 MB", "50 MB", "850 KB"… (sin decimales cuando son exactos o el archivo es grande). */
export function formatSize(bytes: number): string {
  if (bytes >= MB) {
    const megabytes =
      bytes >= 100 * MB ? Math.round(bytes / MB) : Math.round((bytes / MB) * 10) / 10;

    return `${String(megabytes).replace('.', ',')} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');

  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/** Mensaje de error si el archivo no sirve; null si se puede subir. */
export function validateFile(
  kind: UploadKind,
  file: { name: string; size: number },
): string | null {
  const { thing, formats } = NAMES[kind];

  if (!ALLOWED_EXTENSIONS[kind].includes(extensionOf(file.name))) {
    return `${thing} debe ser ${formats}.`;
  }

  if (file.size <= 0) {
    return 'El archivo está vacío.';
  }

  if (file.size > MAX_UPLOAD_BYTES[kind]) {
    return `${thing} pesa ${formatSize(file.size)} y el máximo es ${formatSize(MAX_UPLOAD_BYTES[kind])}.`;
  }

  return null;
}

/** ¿Es un archivo subido a esta plataforma (y no un enlace externo)? */
export function isUploadedUrl(url: string): boolean {
  return /^\/api\/uploads\/[a-f0-9]{32}\.[a-z0-9]+$/i.test(url.trim());
}

/** Extensiones que el navegador puede reproducir directamente en una etiqueta <video>. */
export function isPlayableVideoUrl(url: string): boolean {
  const clean = url.trim().split(/[?#]/)[0];

  return isUploadedUrl(clean) || /\.(mp4|webm|ogv|ogg|mov)$/i.test(clean);
}

/** PDF y audio de una lección: se suben a `/api/uploads/materials` (hasta 100 MB). */
export const MATERIAL_EXTENSIONS = ['pdf', 'mp3', 'm4a', 'wav', 'aac', 'flac'];
export const MAX_MATERIAL_BYTES = 100 * MB;

/** `accept` del selector de archivos del recurso: PDF, audio, imagen y video. */
export const RESOURCE_ACCEPT = ['.pdf,.mp3,.m4a,.wav,.aac,.flac', ACCEPT.image, ACCEPT.video].join(',');

export type ResourceFileKind = UploadKind | 'material';

/** Qué endpoint corresponde a un archivo según su extensión; null si no es un formato permitido. */
export function resourceFileKind(fileName: string): ResourceFileKind | null {
  const extension = extensionOf(fileName);

  if (MATERIAL_EXTENSIONS.includes(extension)) return 'material';
  if (ALLOWED_EXTENSIONS.image.includes(extension)) return 'image';
  // Un .ogg se sube como video (igual que en el campo de video); el navegador lo reproduce también si es solo audio.
  if (ALLOWED_EXTENSIONS.video.includes(extension)) return 'video';

  return null;
}

/** El tipo de recurso que le corresponde a lo que se sube (PDF, audio, imagen o video). */
export function resourceTypeOf(
  fileName: string,
  kind: ResourceFileKind,
): 'PDF' | 'AUDIO' | 'IMAGE' | 'VIDEO' {
  if (kind === 'image') return 'IMAGE';
  if (kind === 'video') return 'VIDEO';

  return extensionOf(fileName) === 'pdf' ? 'PDF' : 'AUDIO';
}

/** Mensaje de error si el archivo de un recurso no sirve; null si se puede subir. */
export function validateResourceFile(file: { name: string; size: number }): string | null {
  const kind = resourceFileKind(file.name);

  if (!kind) {
    return 'Usa un PDF, audio (MP3, M4A, WAV, AAC, FLAC), imagen (JPG, PNG, GIF, WebP) o video (MP4, WebM, MOV, OGG).';
  }

  if (kind !== 'material') return validateFile(kind, file);
  if (file.size <= 0) return 'El archivo está vacío.';
  if (file.size > MAX_MATERIAL_BYTES) {
    return `El archivo pesa ${formatSize(file.size)} y el máximo es ${formatSize(MAX_MATERIAL_BYTES)}.`;
  }

  return null;
}
