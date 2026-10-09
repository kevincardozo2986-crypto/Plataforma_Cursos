import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { DashboardService } from '../dashboard/dashboard.service.js';
import { UsersService } from '../users/users.service.js';
import { ChangePasswordDto, UpdateProfileDto } from './dto/profile.dto.js';
import { ProfileRepository, type ProfileData } from './profile.repository.js';

const BCRYPT_ROUNDS = 12;

/** Valores que se usan mientras la persona no haya guardado su perfil. */
const DEFAULTS = {
  timezone: 'America/Bogota',
  autoplayNext: true,
  reduceMotion: false,
  theme: 'SYSTEM',
  fontSize: 'MEDIUM',
  highContrast: false,
  colorFilter: 'NONE',
} as const;

@Injectable()
export class ProfileService {
  constructor(
    private readonly repository: ProfileRepository,
    private readonly users: UsersService,
    private readonly dashboard: DashboardService,
  ) {}

  /** Mi cuenta, mi perfil, mis preferencias y (si soy docente) mis estadísticas. */
  async get(user: AuthenticatedUser) {
    const account = await this.users.findById(user.id);

    if (!account) {
      throw new NotFoundException('La cuenta no existe');
    }

    const profile = await this.repository.findProfile(user.id);

    return {
      account: {
        id: account.id,
        firstName: account.firstName,
        lastName: account.lastName,
        email: account.email,
        phone: account.phone,
        role: account.role,
        createdAt: account.createdAt,
      },
      profile: {
        occupation: profile?.occupation ?? null,
        timezone: profile?.timezone ?? DEFAULTS.timezone,
        publicName: profile?.publicName ?? null,
        bio: profile?.bio ?? null,
        signatureUrl: profile?.signatureUrl ?? null,
        social: {
          facebookUrl: profile?.facebookUrl ?? null,
          xUrl: profile?.xUrl ?? null,
          linkedinUrl: profile?.linkedinUrl ?? null,
          githubUrl: profile?.githubUrl ?? null,
          websiteUrl: profile?.websiteUrl ?? null,
        },
      },
      preferences: {
        autoplayNext: profile?.autoplayNext ?? DEFAULTS.autoplayNext,
        reduceMotion: profile?.reduceMotion ?? DEFAULTS.reduceMotion,
        theme: profile?.theme ?? DEFAULTS.theme,
        fontSize: profile?.fontSize ?? DEFAULTS.fontSize,
        highContrast: profile?.highContrast ?? DEFAULTS.highContrast,
        colorFilter: profile?.colorFilter ?? DEFAULTS.colorFilter,
      },
      stats: user.role === Role.TEACHER ? await this.statsOf(user) : null,
    };
  }

  /** Guarda lo que llegue; lo que no se envía no se toca. Devuelve el perfil ya actualizado. */
  async update(user: AuthenticatedUser, dto: UpdateProfileDto) {
    const { firstName, lastName, phone, ...profile } = dto;

    if (
      profile.signatureUrl &&
      user.role !== Role.TEACHER &&
      user.role !== Role.ADMIN
    ) {
      throw new ForbiddenException('Solo los docentes tienen firma');
    }

    if (
      firstName !== undefined ||
      lastName !== undefined ||
      phone !== undefined
    ) {
      await this.users.updateBasics(user.id, { firstName, lastName, phone });
    }

    const data = Object.fromEntries(
      Object.entries(profile).filter(([, value]) => value !== undefined),
    ) as ProfileData;

    if (Object.keys(data).length > 0) {
      await this.repository.upsertProfile(user.id, data);
    }

    return this.get(user);
  }

  async changePassword(user: AuthenticatedUser, dto: ChangePasswordDto) {
    const account = await this.users.findWithPasswordHash(user.id);

    if (
      !account ||
      !(await bcrypt.compare(dto.currentPassword, account.passwordHash))
    ) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'La contraseña nueva debe ser distinta de la actual',
      );
    }

    await this.users.updatePasswordHash(
      user.id,
      await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS),
    );

    return { changed: true };
  }

  /** Lo que ve cualquiera de un docente: nombre público, biografía y redes. Sin correo ni documento. */
  async publicTeacher(id: number) {
    const teacher = await this.repository.findTeacherPublic(id);

    if (!teacher) {
      throw new NotFoundException('El docente no existe');
    }

    const { profile } = teacher;

    return {
      id: teacher.id,
      name: profile?.publicName ?? `${teacher.firstName} ${teacher.lastName}`,
      occupation: profile?.occupation ?? null,
      bio: profile?.bio ?? null,
      social: {
        facebookUrl: profile?.facebookUrl ?? null,
        xUrl: profile?.xUrl ?? null,
        linkedinUrl: profile?.linkedinUrl ?? null,
        githubUrl: profile?.githubUrl ?? null,
        websiteUrl: profile?.websiteUrl ?? null,
      },
      publishedCourses: await this.repository.countPublishedCourses(id),
    };
  }

  private async statsOf(user: AuthenticatedUser) {
    const summary = await this.dashboard.teacher(user, { period: 'all' });

    return {
      courses: summary.courses.total,
      students: summary.students,
      rating: summary.rating,
    };
  }
}
