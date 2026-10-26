import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseAccessModule } from '../course-access/course-access.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { CourseFilesController } from './course-files.controller.js';
import { CourseFilesRepository } from './course-files.repository.js';
import { CourseFilesService } from './course-files.service.js';

@Module({
  imports: [AuthModule, CourseAccessModule, ProgressModule, UploadsModule],
  controllers: [CourseFilesController],
  providers: [CourseFilesService, CourseFilesRepository],
  exports: [CourseFilesService],
})
export class CourseFilesModule {}
