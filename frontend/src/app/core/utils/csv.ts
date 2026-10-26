/**
 * Un CSV que Excel abre bien en español: separador «;» (el de la configuración regional de
 * Colombia y España), saltos de línea de Windows y una marca de orden de bytes para que las tildes
 * y la «ñ» no se dañen.
 */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined): string => {
    const text = value === null || value === undefined ? '' : String(value);
    // Una celda que empieza con = + - @ se tomaría como fórmula al abrirla en Excel.
    const safe = /^[=+\-@]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;

    return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };

  return '\uFEFF' + [headers, ...rows].map((row) => row.map(cell).join(';')).join('\r\n') + '\r\n';
}

/** Baja un texto como archivo `.csv`. */
export function downloadCsv(fileName: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
