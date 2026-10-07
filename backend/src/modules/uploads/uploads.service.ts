import { BadRequestException, Injectable } from '@nestjs/common';
import { open, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { FfmpegRunner } from './ffmpeg-runner.js';
import { optimizeImage } from './image-optimizer.js';
import {
  ALLOWED_EXTENSIONS,
  detectMedia,
  type MediaKind,
  SIGNATURE_BYTES,
} from './media-signature.js';
import { mediaSettings } from './media-settings.js';
import { extensionOf, idOf, STORED_NAME, uploadsDir } from './upload-paths.js';
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

export function acceptsExtension(kind: MediaKind, originalName: string): boolean {
  return ALLOWED_EXTENSIONS[kind].includes(extensionOf(originalName));
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
