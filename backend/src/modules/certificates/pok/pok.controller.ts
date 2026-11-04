import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../../generated/prisma/enums.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { CertificatesService } from '../certificates.service.js';
import { SetPokTemplateDto } from './dto/pok.dto.js';
import { PokService } from './pok.service.js';

/** Pantalla POK del docente: conexión, diseños de la cuenta y qué diseño usa cada curso. */
@Controller('pok')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TEACHER, Role.ADMIN)
export class PokController {
  constructor(
    private readonly pok: PokService,
    private readonly certificates: CertificatesService,
  ) {}

  /** `{ enabled }` y, si está activo, la organización, los créditos y la configuración. */
  @Get('status')
  status() {
    return this.pok.status();
  }

  /** Los diseños de certificado de la cuenta de POK. */
  @Get('templates')
  templates() {
    return this.pok.templates();
  }

  /**
   * Cómo se ve la credencial con ese diseño: `{ url }` de la imagen que genera POK. `?title=` es el nombre del
   * curso que aparecerá en ella (con un estudiante de ejemplo).
   */
  @Get('templates/:templateId/preview')
  preview(@Param('templateId') templateId: string, @Query('title') title?: string) {
    return this.pok.preview(templateId, (title ?? '').slice(0, 150));
  }

  /** Mis cursos con el diseño de POK que usa cada uno y cuántos certificados faltan por enviar. */
  @Get('courses')
  courses(@CurrentUser() user: AuthenticatedUser) {
    return this.pok.courses(user);
  }

  /**
   * El curso emite en POK con este diseño: `{ "pokTemplateId": "…" }`; o `null` para volver al certificado de
   * la plataforma. Quienes ya terminaron el curso reciben su credencial al elegir POK (`issued`).
   */
  @Put('courses/:courseId/template')
  async setTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() dto: SetPokTemplateDto,
  ) {
    const result = await this.pok.setCourseTemplate(user, courseId, dto.pokTemplateId);
    const issued = result.pokTemplateId ? await this.certificates.issueMissing(courseId) : 0;

    return { ...result, issued };
  }

  /** Envía a POK los certificados del curso que todavía no están allá. */
  @Post('courses/:courseId/send-pending')
  sendPending(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.pok.sendPending(user, courseId);
  }
}
