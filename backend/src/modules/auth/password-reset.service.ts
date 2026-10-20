import { ActivityNotificationsService } from '../notifications/activity-notifications.service.js';
import {
  BadRequestException,
  HttpException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { PasswordMailer } from './password-mailer.service.js';

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: PasswordMailer,
    private readonly config: ConfigService,
    @Optional() private readonly activity?: ActivityNotificationsService,
  ) {}
  private digest(userId: number, code: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update(`password-reset:${userId}:${code}`)
      .digest('hex');
  }
  async request(user: AuthenticatedUser, identifier: string) {
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
    });
    const key = identifier.trim();
    if (
      !account ||
      account.status !== 'ACTIVE' ||
      (key.toLowerCase() !== account.email.toLowerCase() &&
        key !== account.document)
    ) {
      throw new BadRequestException(
        'Escribe el correo o la cedula de tu cuenta.',
      );
    }
    this.mail.assertConfigured();
    const now = new Date();
    const code = String(randomInt(100000, 1000000));
    const hash = this.digest(user.id, code);
    const claimed = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [
          { passwordResetRequestedAt: null },
          {
            passwordResetRequestedAt: { lte: new Date(now.getTime() - 60000) },
          },
        ],
      },
      data: {
        passwordResetHash: hash,
        passwordRecoveryChallengeHash: null,
        passwordResetExpiresAt: new Date(now.getTime() + 600000),
        passwordResetRequestedAt: now,
        passwordResetAttempts: 0,
      },
    });
    if (!claimed.count)
      throw new HttpException(
        'Espera un minuto antes de pedir otro codigo.',
        429,
      );
    try {
      await this.mail.sendCode(account.email, code);
    } catch (error) {
      await this.prisma.user.updateMany({
        where: { id: user.id, passwordResetHash: hash },
        data: { passwordResetHash: null, passwordResetExpiresAt: null },
      });
      throw error;
    }
    const [local, domain] = account.email.split('@');
    return {
      sent: true,
      destination: `${local.slice(0, 1)}***@${domain}`,
      expiresInSeconds: 600,
      retryAfterSeconds: 60,
    };
  }
  async requestRecovery(identifier: string) {
    this.mail.assertConfigured();
    const challenge = randomBytes(32).toString('hex');
    const key = identifier.trim();
    const account = await this.prisma.user.findFirst({
      where: {
        status: 'ACTIVE',
        ...(key.includes('@')
          ? { email: key.toLowerCase() }
          : { document: key }),
      },
    });
    if (account) {
      try {
        await this.request(account, identifier);
        await this.prisma.user.updateMany({
          where: { id: account.id, passwordResetHash: { not: null } },
          data: {
            passwordRecoveryChallengeHash: createHash('sha256')
              .update(challenge)
              .digest('hex'),
          },
        });
      } catch (error) {
        if (
          !(error instanceof HttpException) ||
          ![429, 503].includes(error.getStatus())
        )
          throw error;
      }
    }
    return { challenge, expiresInSeconds: 600, retryAfterSeconds: 60 };
  }
  async confirmRecovery(challenge: string, code: string, newPassword: string) {
    const account = await this.prisma.user.findFirst({
      where: {
        passwordRecoveryChallengeHash: createHash('sha256')
          .update(challenge)
          .digest('hex'),
        status: 'ACTIVE',
      },
    });
    if (!account)
      throw new BadRequestException(
        'El codigo no es valido o ha vencido. Solicita uno nuevo.',
      );
    return this.confirm(account, code, newPassword);
  }
  async confirm(user: AuthenticatedUser, code: string, newPassword: string) {
    const now = new Date();
    const attempted = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        status: 'ACTIVE',
        passwordResetHash: { not: null },
        passwordResetExpiresAt: { gt: now },
        passwordResetAttempts: { lt: 5 },
      },
      data: { passwordResetAttempts: { increment: 1 } },
    });
    if (!attempted.count)
      throw new BadRequestException(
        'Codigo vencido o bloqueado. Solicita uno nuevo.',
      );
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const changed = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        status: 'ACTIVE',
        passwordResetHash: this.digest(user.id, code),
        passwordResetExpiresAt: { gt: new Date() },
        passwordResetAttempts: { lte: 5 },
      },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
        passwordResetHash: null,
        passwordRecoveryChallengeHash: null,
        passwordResetExpiresAt: null,
        passwordResetAttempts: 0,
      },
    });
    if (!changed.count)
      throw new BadRequestException(
        'El codigo no es valido. Revisa el correo e intenta otra vez.',
      );
    await this.activity?.passwordChanged(user.id);
    return { changed: true };
  }
}
