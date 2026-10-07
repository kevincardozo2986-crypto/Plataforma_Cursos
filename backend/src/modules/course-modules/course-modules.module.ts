import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseAccessModule } from '../course-access/course-access.module.js';
import { CourseModulesController } from './course-modules.controller.js';
import { CourseModulesRepository } from './course-modules.repository.js';
import { CourseModulesService } from './course-modules.service.js';

@Module({
  imports: [AuthModule, CourseAccessModule],
  controllers: [CourseModulesController],
  providers: [CourseModulesService, CourseModulesRepository],
  exports: [CourseModulesService],
})
export class CourseModulesModule {}
