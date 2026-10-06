import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';

/**
 * Carpeta de archivos subidos. Solo se sirve lo que está en su raíz, y con
 * nombres válidos (ver STORED_NAME). Las subcarpetas con punto son internas:
 * - .incoming: originales recién subidos, esperando a optimizarse. No son públicos.
 * - .state: avance o error de la optimización de cada video.
 * - .private: documentos de las entregas de los estudiantes. Nunca se sirven por la ruta
 *   pública: solo los descarga quien tiene permiso (ver el módulo assignments).
 */
export function uploadsDir(): string {
  return process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads');
}

export function incomingDir(): string {
  return join(uploadsDir(), '.incoming');
}

export function stateDir(): string {
  return join(uploadsDir(), '.state');
}

export function privateDir(): string {
  return join(uploadsDir(), '.private');
}

/** Crea la carpeta privada si no existe y la devuelve (donde multer deja los documentos). */
export function ensurePrivateDir(): string {
  mkdirSync(privateDir(), { recursive: true });

  return privateDir();
}

/** Nombre de un documento privado: 32 caracteres hexadecimales + extensión permitida. */
export const PRIVATE_NAME = /^[a-f0-9]{32}\.(?:pdf|docx?|xlsx?|pptx?|zip|txt)$/;

/** Crea las carpetas si no existen y devuelve la de entrada (donde multer deja lo recién subido). */
export function ensureUploadDirs(): string {
  mkdirSync(uploadsDir(), { recursive: true });
  mkdirSync(stateDir(), { recursive: true });
  mkdirSync(incomingDir(), { recursive: true });

  return incomingDir();
}

/** Nombre con el que se guardan los archivos: 32 caracteres hexadecimales + extensión. */
export const STORED_NAME = /^[a-f0-9]{32}\.(?:png|jpe?g|gif|webp|mp4|mov|webm|ogv|ogg)$/;

export function extensionOf(originalName: string): string {
  return extname(originalName).slice(1).toLowerCase();
}

export function newStoredName(originalName: string): string {
  return `${randomBytes(16).toString('hex')}.${extensionOf(originalName)}`;
}

/** "abc123.mp4" -> "abc123". */
export function idOf(storedName: string): string {
  return storedName.slice(0, storedName.lastIndexOf('.'));
}
