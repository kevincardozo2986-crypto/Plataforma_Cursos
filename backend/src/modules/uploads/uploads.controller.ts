import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { diskStorage } from 'multer';

import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { MediaKind } from './media-signature.js';
import {
  acceptsExtension,
  ensureUploadsDir,
  MAX_UPLOAD_BYTES,
  newStoredName,
  type StoredFile,
  UploadsService,
} from './uploads.service.js';

type Callback<T> = (error: Error | null, value: T) => void;

/** Opciones de multer para un tipo de archivo: disco, nombre aleatorio, tamaño y extensión. */
function uploadOptions(kind: MediaKind) {
  return {
    storage: diskStorage({
      destination: (_req: unknown, _file: unknown, done: Callback<string>) => {
        try {
          done(null, ensureUploadsDir());
        } catch (error) {
          done(error as Error, '');
        }
      },
      filename: (_req: unknown, file: { originalname: string }, done: Callback<string>) =>
        done(null, newStoredName(file.originalname)),
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES[kind], files: 1 },
    fileFilter: (_req: unknown, file: { originalname: string }, done: Callback<boolean>) => {
      if (acceptsExtension(kind, file.originalname)) {
        done(null, true);
        return;
      }

      done(
        new BadRequestException(
          kind === 'image'
            ? 'Formato no permitido: usa JPG, PNG, GIF o WebP'
            : 'Formato no permitido: usa MP4, WebM, MOV u OGG',
        ),
        false,
      );
    },
  };
}

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', uploadOptions('image')))
  uploadImage(@UploadedFile() file?: StoredFile) {
    return this.uploads.finish(file, 'image');
  }

  @Post('videos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', uploadOptions('video')))
  uploadVideo(@UploadedFile() file?: StoredFile) {
    return this.uploads.finish(file, 'video');
  }

  /**
   * Sirve un archivo subido. Es público (las etiquetas <img> y <video> no envían
   * el token) y se identifica por un nombre aleatorio. Admite rangos, para poder
   * adelantar un video sin descargarlo completo.
   */
  @Get(':name')
  async serve(@Param('name') name: string, @Res() res: Response) {
    const path = await this.uploads.resolve(name);

    if (!path) {
      throw new NotFoundException('El archivo no existe');
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.sendFile(path, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({ statusCode: 404, message: 'El archivo no existe' });
      }
    });
  }
}
