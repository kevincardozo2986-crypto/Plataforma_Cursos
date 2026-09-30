import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseAccessService } from './course-access.service.js';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CoursesController],
  providers: [CoursesService, CourseAccessService],
  exports: [CourseAccessService],
})
export class CoursesModule {}
