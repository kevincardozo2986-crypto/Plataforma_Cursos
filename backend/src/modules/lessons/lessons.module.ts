import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseAccessModule } from '../course-access/course-access.module.js';
import { LessonsController } from './lessons.controller.js';
import { LessonsRepository } from './lessons.repository.js';
import { LessonsService } from './lessons.service.js';

@Module({
  imports: [AuthModule, CourseAccessModule],
  controllers: [LessonsController],
  providers: [LessonsService, LessonsRepository],
  exports: [LessonsService],
})
export class LessonsModule {}
