import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { CertificateFontsController } from './certificate-fonts.controller.js';
import { CertificateFontsRepository } from './certificate-fonts.repository.js';
import { CertificateFontsService } from './certificate-fonts.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CertificateFontsController],
  providers: [CertificateFontsService, CertificateFontsRepository],
  // Los certificados validan la tipografía de cada plantilla y la cargan para dibujar el PDF.
  exports: [CertificateFontsService],
})
export class CertificateFontsModule {}
