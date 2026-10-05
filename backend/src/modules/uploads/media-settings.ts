/** Lee un entero de una variable de entorno; si falta o no es válido, usa el valor por defecto. */
function intFrom(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export interface MediaSettings {
  /** Ruta de ffmpeg; por defecto el del PATH del sistema. */
  ffmpegPath: string;
  /** Alto máximo del video optimizado (720 = HD). Un video más pequeño no se agranda. */
  videoMaxHeight: number;
  /** Calidad del video: menor = mejor calidad y más peso. 28 es un buen equilibrio para clases. */
  videoCrf: number;
  /** Hilos de ffmpeg; 0 = automático. Útil para no acaparar el procesador de un servidor pequeño. */
  ffmpegThreads: number;
  /** Tiempo máximo para optimizar un video, en milisegundos. */
  videoTimeoutMs: number;
  /** Ancho máximo de las imágenes. */
  imageMaxWidth: number;
  /** Calidad WebP de las imágenes (1 a 100). */
  imageQuality: number;
}

/** Se lee al usarla, para respetar el .env ya cargado. */
export function mediaSettings(): MediaSettings {
  return {
    ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
    videoMaxHeight: intFrom(process.env.VIDEO_MAX_HEIGHT, 720) || 720,
    videoCrf: intFrom(process.env.VIDEO_CRF, 28),
    ffmpegThreads: intFrom(process.env.FFMPEG_THREADS, 0),
    videoTimeoutMs: (intFrom(process.env.VIDEO_TIMEOUT_MINUTES, 120) || 120) * 60_000,
    imageMaxWidth: intFrom(process.env.IMAGE_MAX_WIDTH, 1600) || 1600,
    imageQuality: Math.min(100, Math.max(1, intFrom(process.env.IMAGE_QUALITY, 80) || 80)),
  };
}
