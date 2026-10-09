/**
 * Una nota escrita en una caja de texto, convertida a entero entre 0 y `max`.
 * Devuelve null si está vacía o no es válida (decimal, negativa, fuera de rango).
 */
export function parseGrade(raw: string, max: number): number | null {
  const text = raw.trim();

  if (!/^\d+$/.test(text)) {
    return null;
  }

  const value = Number(text);

  return value <= max ? value : null;
}

/** "1,5 MB", "230 KB"… para mostrar el tamaño de un archivo adjunto. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(Math.round((bytes / (1024 * 1024)) * 10) / 10).toString().replace('.', ',')} MB`;
}
