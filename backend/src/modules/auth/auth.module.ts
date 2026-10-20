import { ActivityNotificationsModule } from '../notifications/activity-notifications.module.js';
import { RecoveryRateGuard } from './recovery-rate.guard.js';
import { PasswordMailer } from './password-mailer.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

@Module({
  imports: [
    ActivityNotificationsModule,
    UsersModule,
    ConfigModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),

        signOptions: {
          expiresIn: '1h',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordMailer,
    PasswordResetService,
    RecoveryRateGuard,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [JwtModule, UsersModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
