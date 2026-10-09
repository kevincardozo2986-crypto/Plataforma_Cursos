import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseAccessModule } from '../course-access/course-access.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardRepository } from './dashboard.repository.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [AuthModule, CourseAccessModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository],
  // El perfil del docente muestra sus estadísticas generales a través de este servicio.
  exports: [DashboardService],
})
export class DashboardModule {}
