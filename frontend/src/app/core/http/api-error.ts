import { HttpErrorResponse } from '@angular/common/http';

/** Texto de error para mostrar al usuario a partir de una respuesta del backend. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  if (error.status === 0) {
    return 'No pudimos conectar con el servidor. Inténtalo de nuevo.';
  }

  const message = (error.error as { message?: string | string[] } | null)?.message;

  if (Array.isArray(message)) {
    return message.join(' · ');
  }

  return typeof message === 'string' ? message : fallback;
}
