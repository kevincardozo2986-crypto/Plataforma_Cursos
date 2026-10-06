import {
  BadRequestException,
  ConflictException,
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

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { MediaKind } from './media-signature.js';
import { ensurePrivateDir, ensureUploadDirs, newStoredName } from './upload-paths.js';
import {
  acceptsDocument,
  acceptsExtension,
  MAX_DOCUMENT_BYTES,
  MAX_UPLOAD_BYTES,
  type StoredFile,
  UploadsService,
} from './uploads.service.js';
import { VideoOptimizerService } from './video-optimizer.service.js';

type Callback<T> = (error: Error | null, value: T) => void;

/**
 * Opciones de multer para un tipo de archivo. Lo recién subido cae en una
 * carpeta interna (no pública) hasta que se verifica y se optimiza.
 */
function uploadOptions(kind: MediaKind) {
  return {
    storage: diskStorage({
      destination: (_req: unknown, _file: unknown, done: Callback<string>) => {
        try {
          done(null, ensureUploadDirs());
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

/** Documentos de las entregas: caen directo en la carpeta privada, con nombre aleatorio. */
const documentOptions = {
  storage: diskStorage({
    destination: (_req: unknown, _file: unknown, done: Callback<string>) => {
      try {
        done(null, ensurePrivateDir());
      } catch (error) {
        done(error as Error, '');
      }
    },
    filename: (_req: unknown, file: { originalname: string }, done: Callback<string>) =>
      done(null, newStoredName(file.originalname)),
  }),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
  fileFilter: (_req: unknown, file: { originalname: string }, done: Callback<boolean>) => {
    if (acceptsDocument(file.originalname)) {
      done(null, true);
      return;
    }

    done(
      new BadRequestException(
        'Formato no permitido: usa PDF, Word, Excel, PowerPoint, ZIP o TXT',
      ),
      false,
    );
  },
};

@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly videos: VideoOptimizerService,
  ) {}

  /**
   * Documento para una entrega de tarea (hasta 20 MB). Lo puede subir cualquier usuario con
   * sesión; queda privado: solo lo descargan quien lo subió y el docente del curso.
   */
  @Post('documents')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', documentOptions))
  uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: StoredFile,
  ) {
    return this.uploads.finishDocument(file, user.id);
  }

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

  /** Estado de un archivo subido: listo, optimizándose (con porcentaje) o fallido. */
  @Get(':name/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  async status(@Param('name') name: string) {
    const status = await this.videos.statusOf(name);

    if (!status) {
      throw new NotFoundException('El archivo no existe');
    }

    return status;
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
      // Un video que se está optimizando todavía no existe con su nombre final.
      if ((await this.videos.statusOf(name))?.status === 'processing') {
        throw new ConflictException('El video se está optimizando; vuelve a intentarlo en un momento');
      }

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
