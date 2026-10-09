import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseAccessModule } from '../course-access/course-access.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsRepository } from './reviews.repository.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  imports: [AuthModule, CourseAccessModule, ProgressModule, NotificationsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewsRepository],
  // El catálogo de cursos muestra el promedio de cada curso a través de este servicio.
  exports: [ReviewsService],
})
export class ReviewsModule {}
