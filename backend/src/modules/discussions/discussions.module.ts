import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseAccessModule } from '../course-access/course-access.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { DiscussionsController } from './discussions.controller.js';
import { DiscussionsRepository } from './discussions.repository.js';
import { DiscussionsService } from './discussions.service.js';

@Module({
  imports: [AuthModule, CourseAccessModule, ProgressModule, NotificationsModule],
  controllers: [DiscussionsController],
  providers: [DiscussionsService, DiscussionsRepository],
})
export class DiscussionsModule {}
