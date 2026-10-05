import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { open, stat, unlink } from 'node:fs/promises';
import { extname, join } from 'node:path';

import {
  ALLOWED_EXTENSIONS,
  detectMedia,
  type MediaKind,
  SIGNATURE_BYTES,
} from './media-signature.js';

/** Lo mínimo que usamos del archivo que entrega multer. */
export interface StoredFile {
  filename: string;
  path: string;
  size: number;
  originalname: string;
}

const MB = 1024 * 1024;

/** Tamaño máximo por archivo: la miniatura según el estándar del curso; los videos pesan más. */
export const MAX_UPLOAD_BYTES: Record<MediaKind, number> = {
  image: 50 * MB,
  video: 500 * MB,
};

/** Nombre con el que se guardan los archivos: 32 caracteres hexadecimales + extensión. */
export const STORED_NAME = /^[a-f0-9]{32}\.(?:png|jpe?g|gif|webp|mp4|mov|webm|ogv|ogg)$/;

/** Carpeta de archivos subidos. Se lee al usarla, para respetar el .env ya cargado. */
export function uploadsDir(): string {
  return process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads');
}

export function extensionOf(originalName: string): string {
  return extname(originalName).slice(1).toLowerCase();
}

export function newStoredName(originalName: string): string {
  return `${randomBytes(16).toString('hex')}.${extensionOf(originalName)}`;
}

export function ensureUploadsDir(): string {
  const dir = uploadsDir();

  mkdirSync(dir, { recursive: true });

  return dir;
}

export function acceptsExtension(kind: MediaKind, originalName: string): boolean {
  return ALLOWED_EXTENSIONS[kind].includes(extensionOf(originalName));
}

@Injectable()
export class UploadsService {
  /**
   * Comprueba que lo guardado de verdad sea lo que se dijo (por sus primeros
   * bytes) y devuelve la ruta pública. Si no lo es, borra el archivo.
   */
  async finish(file: StoredFile | undefined, kind: MediaKind) {
    if (!file) {
      throw new BadRequestException('Adjunta un archivo en el campo «file»');
    }

    const detected = await this.readSignature(file.path);
    const extension = extensionOf(file.originalname);

    if (!detected || detected.kind !== kind || !detected.extensions.includes(extension)) {
      await unlink(file.path).catch(() => undefined);

      throw new BadRequestException(
        kind === 'image'
          ? 'El archivo no es una imagen válida (usa JPG, PNG, GIF o WebP)'
          : 'El archivo no es un video válido (usa MP4, WebM, MOV u OGG)',
      );
    }

    return {
      url: `/api/uploads/${file.filename}`,
      name: file.originalname,
      size: file.size,
    };
  }

  /** Ruta absoluta de un archivo subido, o null si el nombre es inválido o no existe. */
  async resolve(name: string): Promise<string | null> {
    if (!STORED_NAME.test(name)) {
      return null;
    }

    const path = join(uploadsDir(), name);

    try {
      return (await stat(path)).isFile() ? path : null;
    } catch {
      return null;
    }
  }

  private async readSignature(path: string) {
    const handle = await open(path, 'r');

    try {
      const head = Buffer.alloc(SIGNATURE_BYTES);
      const { bytesRead } = await handle.read(head, 0, SIGNATURE_BYTES, 0);

      return detectMedia(head.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  }
}
