import { LearningPolicyModule } from '../learning-policy/learning-policy.module.js';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CertificateFontsModule } from '../certificate-fonts/certificate-fonts.module.js';
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
  imports: [
    LearningPolicyModule,
    AuthModule,
    CourseAccessModule,
    UsersModule,
    NotificationsModule,
    CertificateFontsModule,
  ],
  controllers: [CertificateTemplatesController, CertificatesController],
  providers: [CertificatesService, CertificatesRepository],
  // Progreso emite el certificado al completar un curso; cursos asigna la plantilla.
  exports: [CertificatesService],
})
export class CertificatesModule {}
