/** "45 minutos", "1 hora", "1,5 horas". Sin duración devuelve un texto vacío. */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) {
    return '';
  }

  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  }

  const hours = Math.round((minutes / 60) * 10) / 10;

  return `${String(hours).replace('.', ',')} ${hours === 1 ? 'hora' : 'horas'}`;
}
