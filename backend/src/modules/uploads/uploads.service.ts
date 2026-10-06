import { BadRequestException, Injectable } from '@nestjs/common';
import { open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DOCUMENT_EXTENSIONS,
  DOCUMENT_SIGNATURE_BYTES,
  isValidDocument,
} from './document-signature.js';
import { FfmpegRunner } from './ffmpeg-runner.js';
import { optimizeImage } from './image-optimizer.js';
import {
  ALLOWED_EXTENSIONS,
  detectMedia,
  type MediaKind,
  SIGNATURE_BYTES,
} from './media-signature.js';
import { mediaSettings } from './media-settings.js';
import {
  extensionOf,
  idOf,
  PRIVATE_NAME,
  privateDir,
  STORED_NAME,
  uploadsDir,
} from './upload-paths.js';
import { VideoOptimizerService } from './video-optimizer.service.js';

/** Lo mínimo que usamos del archivo que entrega multer. */
export interface StoredFile {
  filename: string;
  path: string;
  size: number;
  originalname: string;
}

export interface UploadResult {
  /** Ruta pública del archivo ya optimizado (o que lo estará cuando termine). */
  url: string;
  name: string;
  /** Peso final; en un video que se está optimizando todavía es el del original. */
  size: number;
  originalSize: number;
  /** processing = el video se está optimizando y todavía no se puede reproducir. */
  status: 'ready' | 'processing';
  /** false si no se pudo optimizar (por ejemplo, ffmpeg no está instalado). */
  optimized: boolean;
}

const MB = 1024 * 1024;

/** Tamaño máximo de lo que se sube (antes de optimizar). */
export const MAX_UPLOAD_BYTES: Record<MediaKind, number> = {
  image: 50 * MB,
  video: 500 * MB,
};

/** Tamaño máximo de un documento de una entrega. */
export const MAX_DOCUMENT_BYTES = 20 * MB;

export function acceptsExtension(kind: MediaKind, originalName: string): boolean {
  return ALLOWED_EXTENSIONS[kind].includes(extensionOf(originalName));
}

export function acceptsDocument(originalName: string): boolean {
  return DOCUMENT_EXTENSIONS.includes(extensionOf(originalName));
}

@Injectable()
export class UploadsService {
  constructor(
    private readonly runner: FfmpegRunner,
    private readonly videos: VideoOptimizerService,
  ) {}

  /**
   * Comprueba que lo guardado de verdad sea lo que se dijo (por sus primeros
   * bytes) y lo deja optimizado: la imagen al momento, el video en segundo plano.
   * Si no es válido, borra el archivo.
   */
  async finish(file: StoredFile | undefined, kind: MediaKind): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('Adjunta un archivo en el campo «file»');
    }

    const detected = await this.readSignature(file.path);
    const extension = extensionOf(file.originalname);

    if (!detected || detected.kind !== kind || !detected.extensions.includes(extension)) {
      await rm(file.path, { force: true });

      throw new BadRequestException(
        kind === 'image'
          ? 'El archivo no es una imagen válida (usa JPG, PNG, GIF o WebP)'
          : 'El archivo no es un video válido (usa MP4, WebM, MOV u OGG)',
      );
    }

    return kind === 'image' ? this.finishImage(file) : this.finishVideo(file, extension);
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

  private async finishImage(file: StoredFile): Promise<UploadResult> {
    const settings = mediaSettings();
    const storedName = `${idOf(file.filename)}.webp`;
    const output = join(uploadsDir(), storedName);

    try {
      const size = await optimizeImage(file.path, output, {
        maxWidth: settings.imageMaxWidth,
        quality: settings.imageQuality,
      });

      return {
        url: `/api/uploads/${storedName}`,
        name: file.originalname,
        size,
        originalSize: file.size,
        status: 'ready',
        optimized: true,
      };
    } catch {
      await rm(output, { force: true });

      throw new BadRequestException('No pudimos procesar la imagen. Prueba con otra o con otro formato.');
    } finally {
      await rm(file.path, { force: true });
    }
  }

  private async finishVideo(file: StoredFile, extension: string): Promise<UploadResult> {
    const base = { name: file.originalname, originalSize: file.size };

    if (await this.runner.isAvailable()) {
      const id = idOf(file.filename);

      this.videos.enqueue({ id, inputPath: file.path, inputExt: extension, inputSize: file.size });

      // El nombre final es siempre .mp4; el archivo aparece ahí cuando termina la optimización.
      return {
        ...base,
        url: `/api/uploads/${id}.mp4`,
        size: file.size,
        status: 'processing',
        optimized: true,
      };
    }

    // Sin ffmpeg no se puede optimizar: se conserva el video tal cual, para no fallar.
    await rename(file.path, join(uploadsDir(), file.filename));

    return {
      ...base,
      url: `/api/uploads/${file.filename}`,
      size: file.size,
      status: 'ready',
      optimized: false,
    };
  }

  /**
   * Un documento de una entrega (PDF, Word, Excel, PowerPoint, ZIP o TXT). Se comprueba por
   * su contenido y queda en la carpeta privada, junto a una ficha con su nombre original y
   * quién lo subió. Si no es válido, se borra.
   */
  async finishDocument(
    file: StoredFile | undefined,
    userId: number,
  ): Promise<PrivateFileInfo & { name: string }> {
    if (!file) {
      throw new BadRequestException('Adjunta un archivo en el campo «file»');
    }

    const head = await this.readHead(file.path, DOCUMENT_SIGNATURE_BYTES);

    if (!isValidDocument(head, extensionOf(file.filename))) {
      await rm(file.path, { force: true });

      throw new BadRequestException(
        'El archivo no es un documento válido (usa PDF, Word, Excel, PowerPoint, ZIP o TXT)',
      );
    }

    const info: PrivateFileInfo = {
      originalName: cleanFileName(file.originalname),
      size: file.size,
      uploadedBy: userId,
    };

    await writeFile(this.metaPath(file.filename), JSON.stringify(info));

    return { name: file.filename, ...info };
  }

  /** Ficha de un documento privado (nombre original, peso, quién lo subió), o null si no existe. */
  async privateInfo(name: string): Promise<PrivateFileInfo | null> {
    if (!PRIVATE_NAME.test(name)) {
      return null;
    }

    try {
      return JSON.parse(await readFile(this.metaPath(name), 'utf8')) as PrivateFileInfo;
    } catch {
      return null;
    }
  }

  /** Ruta absoluta de un documento privado, o null si el nombre es inválido o no existe. */
  async resolvePrivate(name: string): Promise<string | null> {
    if (!PRIVATE_NAME.test(name)) {
      return null;
    }

    const path = join(privateDir(), name);

    try {
      return (await stat(path)).isFile() ? path : null;
    } catch {
      return null;
    }
  }

  /** Borra documentos privados y sus fichas (por ejemplo, al eliminar una tarea). */
  async removePrivate(names: string[]): Promise<void> {
    for (const name of names.filter((n) => PRIVATE_NAME.test(n))) {
      await rm(join(privateDir(), name), { force: true });
      await rm(this.metaPath(name), { force: true });
    }
  }

  private metaPath(storedName: string) {
    return join(privateDir(), `${idOf(storedName)}.json`);
  }

  private async readSignature(path: string) {
    const head = await this.readHead(path, SIGNATURE_BYTES);

    return detectMedia(head);
  }

  /** Los primeros `length` bytes de un archivo (menos, si es más corto). */
  private async readHead(path: string, length: number): Promise<Buffer> {
    const handle = await open(path, 'r');

    try {
      const head = Buffer.alloc(length);
      const { bytesRead } = await handle.read(head, 0, length, 0);

      return head.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }
}

/** Datos guardados junto a cada documento privado. */
export interface PrivateFileInfo {
  originalName: string;
  size: number;
  uploadedBy: number;
}

/**
 * Nombre del archivo tal como se mostrará al descargarlo. Multer lo entrega leído como
 * latin1; se corrige a UTF-8 (tildes, ñ) y se le quitan rutas y caracteres de control.
 */
export function cleanFileName(originalName: string): string {
  const utf8 = Buffer.from(originalName, 'latin1').toString('utf8');
  const decoded = utf8.includes('�') ? originalName : utf8;

  return (
    decoded
      .replace(/[\\/]/g, '_')
      .replace(/\p{Cc}/gu, '')
      .trim()
      .slice(-120) || 'documento'
  );
}
