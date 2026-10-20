import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { PrismaService } from '../../database/prisma.service.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { PasswordResetService } from './password-reset.service.js';
import type { PasswordMailer } from './password-mailer.service.js';

const user = {
  id: 5,
  email: 'ana@example.com',
  document: '123456',
  status: 'ACTIVE' as const,
  sessionVersion: 0,
  firstName: 'Ana',
  lastName: 'Lopez',
  phone: null,
  role: 'STUDENT' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};
function build() {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      findFirst: vi.fn().mockResolvedValue(user),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const mail = {
    assertConfigured: vi.fn(),
    sendCode: vi.fn().mockResolvedValue(undefined),
  };
  const config = new ConfigService({ JWT_SECRET: 'test-secret' });
  const service = new PasswordResetService(
    prisma as unknown as PrismaService,
    mail as unknown as PasswordMailer,
    config,
  );
  return { service, prisma, mail };
}
describe('Email password verification', () => {
  it.each(['ANA@EXAMPLE.COM', '123456'])(
    'uses the stored email when identified by %s',
    async (identifier) => {
      const { service, prisma, mail } = build();
      const result = await service.request(
        user as AuthenticatedUser,
        identifier,
      );
      expect(mail.sendCode).toHaveBeenCalledWith(
        'ana@example.com',
        expect.stringMatching(/^\d{6}$/),
      );
      const code = mail.sendCode.mock.calls[0][1];
      const stored = prisma.user.updateMany.mock.calls[0][0].data;
      expect(stored.passwordResetHash).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.passwordResetHash).not.toBe(code);
      expect(result).toMatchObject({
        sent: true,
        destination: 'a***@example.com',
        expiresInSeconds: 600,
      });
      expect(JSON.stringify(result)).not.toContain(code);
    },
  );
  it('does not send to an address supplied for another account', async () => {
    const { service, mail, prisma } = build();
    await expect(
      service.request(user as AuthenticatedUser, 'attacker@example.com'),
    ).rejects.toThrow(BadRequestException);
    expect(mail.sendCode).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it('does not claim or send a code if SMTP is unconfigured', async () => {
    const { service, mail, prisma } = build();
    mail.assertConfigured.mockImplementation(() => {
      throw new ServiceUnavailableException();
    });
    await expect(
      service.request(user as AuthenticatedUser, '123456'),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it('enforces a database cooldown before resending', async () => {
    const { service, prisma, mail } = build();
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.request(user as AuthenticatedUser, '123456'),
    ).rejects.toThrow(HttpException);
    expect(mail.sendCode).not.toHaveBeenCalled();
    expect(prisma.user.updateMany.mock.calls[0][0].where.OR).toHaveLength(2);
  });
  it('invalidates the issued code when delivery fails', async () => {
    const { service, prisma, mail } = build();
    mail.sendCode.mockRejectedValue(new ServiceUnavailableException());
    await expect(
      service.request(user as AuthenticatedUser, '123456'),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.user.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { passwordResetHash: null, passwordResetExpiresAt: null },
      }),
    );
  });
  it('blocks expired, missing or exhausted codes before hashing a password', async () => {
    const { service, prisma } = build();
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.confirm(user as AuthenticatedUser, '123456', 'new-password'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.updateMany.mock.calls[0][0].where).toMatchObject({
      id: 5,
      passwordResetAttempts: { lt: 5 },
    });
  });
  it('does not change the password for a mismatched code', async () => {
    const { service, prisma } = build();
    prisma.user.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await expect(
      service.confirm(user as AuthenticatedUser, '000000', 'new-password'),
    ).rejects.toThrow(BadRequestException);
  });
  it('atomically consumes the code, hashes the password and revokes sessions', async () => {
    const { service, prisma } = build();
    await expect(
      service.confirm(user as AuthenticatedUser, '123456', 'new-password'),
    ).resolves.toEqual({ changed: true });
    const update = prisma.user.updateMany.mock.calls[1][0];
    expect(update.where).toMatchObject({
      id: 5,
      passwordResetAttempts: { lte: 5 },
      passwordResetHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(update.data).toMatchObject({
      sessionVersion: { increment: 1 },
      passwordResetHash: null,
      passwordResetExpiresAt: null,
    });
    expect(await bcrypt.compare('new-password', update.data.passwordHash)).toBe(
      true,
    );
  });
});

describe('Public login recovery', () => {
  it('returns an opaque challenge without revealing an unknown identifier', async () => {
    const { service, prisma, mail } = build();
    prisma.user.findFirst.mockResolvedValue(null);
    const result = await service.requestRecovery('unknown@example.com');
    expect(result).toEqual({
      challenge: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresInSeconds: 600,
      retryAfterSeconds: 60,
    });
    expect(mail.sendCode).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it('binds the public challenge to the account identified by document', async () => {
    const { service, prisma, mail } = build();
    const result = await service.requestRecovery('123456');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', document: '123456' },
    });
    expect(mail.sendCode).toHaveBeenCalledWith(
      user.email,
      expect.stringMatching(/^\d{6}$/),
    );
    const stored =
      prisma.user.updateMany.mock.calls[1][0].data
        .passwordRecoveryChallengeHash;
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
    expect(stored).not.toBe(result.challenge);
    expect(result).not.toHaveProperty('destination');
  });
  it('rejects unknown challenges without modifying passwords', async () => {
    const { service, prisma } = build();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.confirmRecovery('a'.repeat(64), '123456', 'new-password'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
  it('consumes a valid public challenge using the existing one-use code flow', async () => {
    const { service, prisma } = build();
    await expect(
      service.confirmRecovery('a'.repeat(64), '123456', 'new-password'),
    ).resolves.toEqual({ changed: true });
    expect(prisma.user.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordRecoveryChallengeHash: null,
          sessionVersion: { increment: 1 },
        }),
      }),
    );
  });
});
