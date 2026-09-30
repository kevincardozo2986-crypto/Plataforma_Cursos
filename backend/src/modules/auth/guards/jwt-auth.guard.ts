import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { UsersService } from '../../users/users.service.js';
import { UserStatus } from '../../../generated/prisma/enums.js';
import type { AuthenticatedRequest } from '../../../common/interfaces/authenticated-request.interface.js';

interface JwtPayload {
  sub: number;
  email: string;
  role: string;
}


@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException(
        'Token no proporcionado',
      );
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<JwtPayload>(
          token,
          {
            secret:
              this.configService.getOrThrow<string>(
                'JWT_SECRET',
              ),
          },
        );

      const user =
        await this.usersService.findById(payload.sub);

      if (!user) {
        throw new UnauthorizedException(
          'Usuario no encontrado',
        );
      }

      if (user.status === UserStatus.INACTIVE) {
        throw new UnauthorizedException(
          'La cuenta se encuentra inactiva',
        );
      }

      request.user = user;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException(
        'Token inválido o expirado',
      );
    }
  }

  private extractToken(
    request: Request,
  ): string | undefined {
    const [type, token] =
      request.headers.authorization?.split(' ') ?? [];

    return type === 'Bearer'
      ? token
      : undefined;
  }
}