import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CourseAccessModule } from '../course-access/course-access.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  CertificatesController,
  CertificateTemplatesController,
} from './certificates.controller.js';
import { CertificatesRepository } from './certificates.repository.js';
import { CertificatesService } from './certificates.service.js';

@Module({
  imports: [AuthModule, CourseAccessModule, UsersModule, NotificationsModule],
  controllers: [CertificateTemplatesController, CertificatesController],
  providers: [CertificatesService, CertificatesRepository],
  // Progreso emite el certificado al completar un curso; cursos asigna la plantilla.
  exports: [CertificatesService],
})
export class CertificatesModule {}
