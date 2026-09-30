import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CreateResourceDto, UpdateResourceDto } from './dto/resource.dto.js';
import { ResourcesService } from './resources.service.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get('lessons/:lessonId/resources')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseIntPipe) lessonId: number,
  ) {
    return this.resources.listByLesson(user, lessonId);
  }

  @Post('lessons/:lessonId/resources')
  @Roles(Role.TEACHER, Role.ADMIN)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Body() dto: CreateResourceDto,
  ) {
    return this.resources.create(user, lessonId, dto);
  }

  @Patch('resources/:id')
  @Roles(Role.TEACHER, Role.ADMIN)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateResourceDto,
  ) {
    return this.resources.update(user, id, dto);
  }

  @Delete('resources/:id')
  @Roles(Role.TEACHER, Role.ADMIN)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.resources.remove(user, id);
  }
}
