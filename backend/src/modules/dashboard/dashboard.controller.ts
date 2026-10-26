import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardQueryDto, StudentsQueryDto } from './dto/dashboard-query.dto.js';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Métricas del panel del docente: `?period=7d|30d|90d|1y|all&courseId=`. */
  @Get('teacher')
  @Roles(Role.TEACHER, Role.ADMIN)
  teacher(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboard.teacher(user, query);
  }

  /** Estudiantes de mis cursos, con su avance: `?period=&courseId=&state=&q=&limit=&offset=`. */
  @Get('teacher/students')
  @Roles(Role.TEACHER, Role.ADMIN)
  students(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StudentsQueryDto,
  ) {
    return this.dashboard.students(user, query);
  }

  /** Reparto de las reseñas por estrellas y las más recientes: `?period=&courseId=`. */
  @Get('teacher/ratings')
  @Roles(Role.TEACHER, Role.ADMIN)
  ratings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboard.ratings(user, query);
  }
}
