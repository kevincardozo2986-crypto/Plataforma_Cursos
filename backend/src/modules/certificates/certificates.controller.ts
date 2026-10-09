import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
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
import { CertificatesService } from './certificates.service.js';
import {
  CreateCertificateTemplateDto,
  ListCertificatesQueryDto,
  UpdateCertificateTemplateDto,
} from './dto/certificate.dto.js';

/** Envía un PDF. `inline` para mostrarlo en pantalla; `attachment` para descargarlo. */
function sendPdf(
  res: Response,
  pdf: Buffer,
  fileName: string,
  disposition: 'inline' | 'attachment',
) {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${disposition}; filename="${fileName}"`,
    'Content-Length': String(pdf.length),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(pdf);
}

/** Plantillas de certificado del docente. */
@Controller('certificate-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TEACHER, Role.ADMIN)
export class CertificateTemplatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.certificates.listTemplates(user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCertificateTemplateDto,
  ) {
    return this.certificates.createTemplate(user, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.certificates.getTemplate(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCertificateTemplateDto,
  ) {
    return this.certificates.updateTemplate(user, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.certificates.removeTemplate(user, id);
  }

  /** PDF de ejemplo para ver cómo queda la plantilla antes de asignarla a un curso. */
  @Get(':id/preview')
  async preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { pdf, fileName } = await this.certificates.previewTemplate(user, id);

    sendPdf(res, pdf, fileName, 'inline');
  }
}

/** Certificados emitidos. */
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  /** Comprobación pública (sin sesión): `GET /certificates/verify/CC-7F3K-9QXA-B2MD`. */
  @Get('verify/:code')
  verify(@Param('code') code: string) {
    return this.certificates.verify(code);
  }

  /** Mis certificados. */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.certificates.mine(user);
  }

  /** Certificados emitidos en mis cursos: `?courseId=&status=VALID|REVOKED&limit=20&offset=0`. */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  listIssued(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCertificatesQueryDto,
  ) {
    return this.certificates.listIssued(user, query);
  }

  /** Descarga el PDF. Requiere el token: se pide con `HttpClient` como blob. */
  @Get(':id/pdf')
  @UseGuards(JwtAuthGuard)
  async pdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { pdf, fileName } = await this.certificates.pdf(user, id);

    sendPdf(res, pdf, fileName, 'attachment');
  }

  @Patch(':id/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.certificates.revoke(user, id);
  }
}
