const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Fecha del backend (ISO, en UTC) al valor de un `<input type="datetime-local">`, que se
 * muestra en la hora local de quien edita: «2026-11-30T23:59».
 */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Lo contrario: la hora local escrita en el campo, a ISO (con zona) para enviarla. */
export function localInputToIso(value: string): string | null {
  if (!value.trim()) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
