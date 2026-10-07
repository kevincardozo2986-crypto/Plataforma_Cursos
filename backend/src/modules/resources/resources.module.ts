import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseAccessModule } from '../course-access/course-access.module.js';
import { ResourcesController } from './resources.controller.js';
import { ResourcesRepository } from './resources.repository.js';
import { ResourcesService } from './resources.service.js';

@Module({
  imports: [AuthModule, CourseAccessModule],
  controllers: [ResourcesController],
  providers: [ResourcesService, ResourcesRepository],
})
export class ResourcesModule {}
