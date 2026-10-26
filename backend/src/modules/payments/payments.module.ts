import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsRepository } from './payments.repository.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [AuthModule, ProgressModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository],
})
export class PaymentsModule {}
