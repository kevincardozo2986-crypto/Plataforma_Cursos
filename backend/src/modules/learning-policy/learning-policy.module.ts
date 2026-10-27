import { Module } from '@nestjs/common';
import { LearningPolicyService } from './learning-policy.service.js';

@Module({
  providers: [LearningPolicyService],
  exports: [LearningPolicyService],
})
export class LearningPolicyModule {}
