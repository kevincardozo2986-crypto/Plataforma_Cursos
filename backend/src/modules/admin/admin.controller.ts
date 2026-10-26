import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AdminService } from './admin.service.js';
import { CreateUserDto, ListAdminCoursesQueryDto, ListUsersQueryDto, UpdateUserDto } from './dto/admin.dto.js';

/** Administración de la plataforma. Solo para administradores. */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** Cifras de toda la plataforma y lo más reciente. */
  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  /** Cuentas: `?q=&role=&status=&limit=&offset=`. */
  @Get('users')
  users(@Query() query: ListUsersQueryDto) {
    return this.admin.users(query);
  }

  /** Crea una cuenta con el rol que se elija (por ejemplo, un docente). */
  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.admin.createUser(dto);
  }

  /** Cambia el rol o el estado (activa/inactiva) de otra cuenta. */
  @Patch('users/:id')
  updateUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.admin.updateUser(user, id, dto);
  }

  /** Todos los cursos de la plataforma: `?q=&status=&teacherId=&limit=&offset=`. */
  @Get('courses')
  courses(@Query() query: ListAdminCoursesQueryDto) {
    return this.admin.courses(query);
  }
}
