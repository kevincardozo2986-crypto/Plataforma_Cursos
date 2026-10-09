import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseAccessModule } from '../course-access/course-access.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { EvaluationsController } from './evaluations.controller.js';
import { EvaluationsRepository } from './evaluations.repository.js';
import { EvaluationsService } from './evaluations.service.js';

@Module({
  imports: [AuthModule, CourseAccessModule, ProgressModule, NotificationsModule],
  controllers: [EvaluationsController],
  providers: [EvaluationsService, EvaluationsRepository],
})
export class EvaluationsModule {}
