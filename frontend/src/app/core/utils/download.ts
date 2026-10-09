/** Descarga un blob como archivo. Libera la URL temporal al terminar. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Abre un blob (por ejemplo un PDF) en otra pestaña. */
export function openBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);

  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
