import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CourseFilesService } from './course-files.service.js';
import { AttachCourseFileDto } from './dto/course-file.dto.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CourseFilesController {
  constructor(private readonly files: CourseFilesService) {}

  /** Los archivos del curso (quien lo gestiona o un estudiante inscrito). */
  @Get('courses/:courseId/files')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.files.list(user, courseId);
  }

  /** Adjunta un documento ya subido con `POST /uploads/documents`. */
  @Post('courses/:courseId/files')
  @Roles(Role.TEACHER, Role.ADMIN)
  attach(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() dto: AttachCourseFileDto,
  ) {
    return this.files.attach(user, courseId, dto.name);
  }

  @Delete('courses/:courseId/files/:fileId')
  @Roles(Role.TEACHER, Role.ADMIN)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Param('fileId', ParseIntPipe) fileId: number,
  ) {
    return this.files.remove(user, courseId, fileId);
  }

  /** Descarga (requiere el token: se pide con `HttpClient` como blob). */
  @Get('course-files/:fileId/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('fileId', ParseIntPipe) fileId: number,
    @Res() res: Response,
  ) {
    const { path, originalName } = await this.files.fileForDownload(user, fileId);

    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Siempre como descarga; la carpeta privada empieza con punto, por eso `dotfiles: 'allow'`.
    res.download(path, originalName, { dotfiles: 'allow' }, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({ statusCode: 404, message: 'El archivo no existe' });
      }
    });
  }
}
