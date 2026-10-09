import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseAccessModule } from '../course-access/course-access.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { AssignmentsController } from './assignments.controller.js';
import { AssignmentsRepository } from './assignments.repository.js';
import { AssignmentsService } from './assignments.service.js';

@Module({
  imports: [
    AuthModule,
    CourseAccessModule,
    ProgressModule,
    UploadsModule,
    NotificationsModule,
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AssignmentsRepository],
})
export class AssignmentsModule {}
