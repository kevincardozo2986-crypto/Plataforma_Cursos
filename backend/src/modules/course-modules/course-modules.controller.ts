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
import { CourseModulesService } from './course-modules.service.js';
import {
  CreateCourseModuleDto,
  UpdateCourseModuleDto,
} from './dto/course-module.dto.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CourseModulesController {
  constructor(private readonly modules: CourseModulesService) {}

  @Get('courses/:courseId/modules')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.modules.listByCourse(user, courseId);
  }

  /**
   * Qué módulos tiene abiertos quien consulta, según la liberación gradual del curso.
   * Cada módulo: `locked`, y si está cerrado `reason` (DATE, DAYS, PREVIOUS, PREREQUISITES,
   * NOT_ENROLLED), `unlocksAt` y `requiredModules`.
   */
  @Get('courses/:courseId/modules/availability')
  availability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.modules.availability(user, courseId);
  }

  @Post('courses/:courseId/modules')
  @Roles(Role.TEACHER, Role.ADMIN)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() dto: CreateCourseModuleDto,
  ) {
    return this.modules.create(user, courseId, dto);
  }

  @Patch('modules/:id')
  @Roles(Role.TEACHER, Role.ADMIN)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourseModuleDto,
  ) {
    return this.modules.update(user, id, dto);
  }

  @Delete('modules/:id')
  @Roles(Role.TEACHER, Role.ADMIN)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.modules.remove(user, id);
  }
}
