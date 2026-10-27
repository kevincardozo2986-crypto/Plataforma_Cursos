import { LearningPolicyModule } from '../learning-policy/learning-policy.module.js';
import { Module } from '@nestjs/common';

import { CourseAccessRepository } from './course-access.repository.js';
import { CourseAccessService } from './course-access.service.js';

@Module({
  imports: [LearningPolicyModule],
  providers: [CourseAccessService, CourseAccessRepository],
  exports: [CourseAccessService],
})
export class CourseAccessModule {}
