import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseAccessModule } from '../course-access/course-access.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { AnnouncementsController } from './announcements.controller.js';
import { AnnouncementsRepository } from './announcements.repository.js';
import { AnnouncementsService } from './announcements.service.js';

@Module({
  imports: [AuthModule, CourseAccessModule, ProgressModule, NotificationsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, AnnouncementsRepository],
})
export class AnnouncementsModule {}
