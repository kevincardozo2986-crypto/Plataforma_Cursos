import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { ActivityNotificationsService } from './activity-notifications.service.js';
@Module({
  imports: [DatabaseModule],
  providers: [ActivityNotificationsService],
  exports: [ActivityNotificationsService],
})
export class ActivityNotificationsModule {}
