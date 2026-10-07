export interface VideoOptions {
  maxHeight: number;
  crf: number;
  /** 0 = automático. */
  threads: number;
}

/**
 * Argumentos de ffmpeg para dejar un video ligero: MP4 con H.264 y AAC,
 * como mucho de `maxHeight` px de alto, y con el índice al inicio (+faststart)
 * para que empiece a reproducirse sin esperar a descargarlo entero.
 *
 * Se pasan como arreglo (sin shell): el nombre del archivo nunca se interpreta como comando.
 */
export function buildFfmpegArgs(input: string, output: string, options: VideoOptions): string[] {
  return [
    '-y',
    '-nostdin',
    '-hide_banner',
    '-loglevel', 'info',
    '-nostats',
    '-progress', 'pipe:1',
    '-i', input,
    // Primer video y, si existe, el primer audio: descarta subtítulos y pistas de datos que complican el MP4.
    '-map', '0:v:0',
    '-map', '0:a:0?',
    // Reduce solo si es más alto que el máximo; el ancho se ajusta a un número par.
    '-vf', `scale=-2:'min(${options.maxHeight},ih)'`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', String(options.crf),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-ac', '2',
    '-movflags', '+faststart',
    ...(options.threads > 0 ? ['-threads', String(options.threads)] : []),
    output,
  ];
}

/** Duración total en segundos, a partir de la línea "Duration: 00:12:34.56," que ffmpeg imprime al empezar. */
export function parseDurationSeconds(text: string): number | null {
  const match = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(text);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** Segundos ya procesados, a partir de la salida de `-progress` (out_time_us=…, en microsegundos). */
export function parseProcessedSeconds(text: string): number | null {
  const all = [...text.matchAll(/out_time_(?:us|ms)=(\d+)/g)];
  const last = all.at(-1);

  return last ? Number(last[1]) / 1_000_000 : null;
}

/** Porcentaje 0-99 (el 100 solo existe cuando termina de verdad). */
export function percentOf(processedSeconds: number, totalSeconds: number | null): number {
  if (!totalSeconds || totalSeconds <= 0) {
    return 0;
  }

  return Math.min(99, Math.max(0, Math.round((processedSeconds / totalSeconds) * 100)));
}
