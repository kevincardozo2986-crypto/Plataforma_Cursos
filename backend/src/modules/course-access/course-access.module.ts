import { Module } from '@nestjs/common';

import { CourseAccessRepository } from './course-access.repository.js';
import { CourseAccessService } from './course-access.service.js';

@Module({
  providers: [CourseAccessService, CourseAccessRepository],
  exports: [CourseAccessService],
})
export class CourseAccessModule {}
