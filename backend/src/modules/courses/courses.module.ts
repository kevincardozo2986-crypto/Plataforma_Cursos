import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { CertificatesModule } from '../certificates/certificates.module.js';
import { CourseAccessModule } from '../course-access/course-access.module.js';
import { CourseModulesModule } from '../course-modules/course-modules.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { ReviewsModule } from '../reviews/reviews.module.js';
import { UsersModule } from '../users/users.module.js';
import { CourseInstructorsService } from './course-instructors.service.js';
import { CoursesController } from './courses.controller.js';
import { CoursesRepository } from './courses.repository.js';
import { CoursesService } from './courses.service.js';

@Module({
  imports: [
    AuthModule,
    CourseAccessModule,
    CategoriesModule,
    CourseModulesModule,
    ProgressModule,
    ReviewsModule,
    UsersModule,
    NotificationsModule,
    CertificatesModule,
  ],
  controllers: [CoursesController],
  providers: [CoursesService, CourseInstructorsService, CoursesRepository],
})
export class CoursesModule {}
