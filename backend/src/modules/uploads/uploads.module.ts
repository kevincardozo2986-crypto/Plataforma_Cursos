import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { FfmpegRunner } from './ffmpeg-runner.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';
import { VideoOptimizerService } from './video-optimizer.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [UploadsService, VideoOptimizerService, FfmpegRunner],
  // Otros módulos (tareas) usan los documentos privados a través de este servicio.
  exports: [UploadsService],
})
export class UploadsModule {}
