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
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AnnouncementsService } from './announcements.service.js';
import {
  CreateAnnouncementDto,
  ListAnnouncementsQueryDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  /**
   * Docente: anuncios de sus cursos. Estudiante: los de los cursos donde está inscrito.
   * `?courseId=&limit=20&offset=0`.
   */
  @Get('announcements')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAnnouncementsQueryDto,
  ) {
    return this.announcements.list(user, query);
  }

  @Post('courses/:courseId/announcements')
  @Roles(Role.TEACHER, Role.ADMIN)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcements.create(user, courseId, dto);
  }

  @Patch('announcements/:id')
  @Roles(Role.TEACHER, Role.ADMIN)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcements.update(user, id, dto);
  }

  @Delete('announcements/:id')
  @Roles(Role.TEACHER, Role.ADMIN)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.announcements.remove(user, id);
  }
}
