import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Role } from '../../generated/prisma/enums.js';

interface CreateUserData {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  document: string;
  phone?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByDocument(document: string) {
    return this.prisma.user.findUnique({
      where: { document },
    });
  }
  async findById(id: number) {
    const user = await this.prisma.user.findUnique({
      include: { profile: { select: { avatarUrl: true } } },
      where: { id },
      omit: {
        passwordHash: true,
        passwordResetHash: true,
        passwordRecoveryChallengeHash: true,
        passwordResetExpiresAt: true,
        passwordResetRequestedAt: true,
        passwordResetAttempts: true,
      },
    });
    if (!user) return null;
    const { profile, ...account } = user;
    return { ...account, avatarUrl: profile?.avatarUrl ?? null };
  }

  /** Para el cambio de contraseña: el usuario con su hash. Nunca se devuelve al cliente. */
  async findWithPasswordHash(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Edición de los datos básicos desde el perfil. `phone: null` borra el teléfono. */
  async updateBasics(
    id: number,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string | null;
      email?: string;
    },
  ) {
    return this.prisma.user.update({
      where: { id },
      data,
      omit: {
        passwordHash: true,
        passwordResetHash: true,
        passwordRecoveryChallengeHash: true,
        passwordResetExpiresAt: true,
        passwordResetRequestedAt: true,
        passwordResetAttempts: true,
      },
    });
  }

  async updatePasswordHash(id: number, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  async create(data: CreateUserData) {
    return this.prisma.user.create({
      data: {
        ...data,
        role: Role.STUDENT,
      },
      omit: {
        passwordHash: true,
        passwordResetHash: true,
        passwordRecoveryChallengeHash: true,
        passwordResetExpiresAt: true,
        passwordResetRequestedAt: true,
        passwordResetAttempts: true,
      },
    });
  }
}
