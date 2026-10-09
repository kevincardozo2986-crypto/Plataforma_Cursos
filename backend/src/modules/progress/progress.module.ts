import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CertificatesModule } from '../certificates/certificates.module.js';
import { CourseAccessModule } from '../course-access/course-access.module.js';
import { LessonsModule } from '../lessons/lessons.module.js';
import { ProgressController } from './progress.controller.js';
import { ProgressRepository } from './progress.repository.js';
import { ProgressService } from './progress.service.js';

@Module({
  imports: [AuthModule, CourseAccessModule, LessonsModule, CertificatesModule],
  controllers: [ProgressController],
  providers: [ProgressService, ProgressRepository],
  exports: [ProgressService],
})
export class ProgressModule {}
