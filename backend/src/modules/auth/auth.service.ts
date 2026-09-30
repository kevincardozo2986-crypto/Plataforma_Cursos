import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { UserStatus } from '../../generated/prisma/enums.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const document = dto.document.trim();

    // Verificar correo duplicado
    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('El correo electrónico ya está registrado');
    }

    // Verificar documento duplicado
    const existingDocument = await this.usersService.findByDocument(document);

    if (existingDocument) {
      throw new ConflictException('El documento ya está registrado');
    }

    // Encriptar contraseña
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Crear usuario
    return this.usersService.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email,
      passwordHash,
      document,
      phone: dto.phone,
    });
  }

  async login(dto: LoginDto) {
    const identifier = dto.identifier.trim();
    const user = identifier.includes('@')
      ? await this.usersService.findByEmail(identifier.toLowerCase())
      : await this.usersService.findByDocument(identifier);

    if (!user) {
      throw new UnauthorizedException('Identificador o contraseña incorrectos');
    }

    // No permitir acceso a usuarios inactivos
    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('La cuenta se encuentra inactiva');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Identificador o contraseña incorrectos');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const { passwordHash: _passwordHash, ...safeUser } = user;

    return {
      accessToken,
      user: safeUser,
    };
  }
}
