import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CertificateFontsService } from './certificate-fonts.service.js';
import { FONT_MIME, MAX_FONT_BYTES } from './font-files.js';
import { libraryFilePath } from './font-library.js';

@Controller('certificate-fonts')
export class CertificateFontsController {
  constructor(private readonly fonts: CertificateFontsService) {}

  /** Las tipografías disponibles: las de la plataforma y las propias de quien consulta. */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  catalog(@CurrentUser() user: AuthenticatedUser) {
    return this.fonts.catalog(user);
  }

  /**
   * Archivo de una tipografía de la plataforma. Es público (son de licencia libre y el navegador
   * las necesita para mostrar la vista previa) y no cambia nunca, así que se guarda en caché.
   */
  @Get('files/:name')
  file(@Param('name') name: string, @Res() res: Response) {
    const path = libraryFilePath(name);

    if (!path) {
      throw new NotFoundException('La tipografía no existe');
    }

    res.set({
      'Content-Type': FONT_MIME.woff,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.sendFile(path);
  }

  /** Sube una tipografía propia (.ttf, .otf, .woff o .woff2, hasta 2 MB). */
  @Post('custom')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_FONT_BYTES, files: 1 } }),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body('name') name?: string,
  ) {
    return this.fonts.upload(user, file, typeof name === 'string' ? name : undefined);
  }

  /** El archivo de una tipografía propia, para la vista previa. Pide sesión: es del docente. */
  @Get('custom/:id/file')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  async customFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { buffer, format } = await this.fonts.customFile(user, id);

    res.set({
      'Content-Type': FONT_MIME[format],
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(buffer);
  }

  @Delete('custom/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.fonts.remove(user, id);
  }
}
