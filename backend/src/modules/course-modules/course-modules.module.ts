import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { CourseModulesController } from './course-modules.controller.js';
import { CourseModulesService } from './course-modules.service.js';

@Module({
  imports: [AuthModule, CoursesModule],
  controllers: [CourseModulesController],
  providers: [CourseModulesService],
})
export class CourseModulesModule {}
