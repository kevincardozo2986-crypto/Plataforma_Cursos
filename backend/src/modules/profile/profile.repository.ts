import { Injectable } from '@nestjs/common';

import { managedBy } from '../../common/prisma/managed-by.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  ColorFilter,
  FontSize,
  ThemePreference,
} from '../../generated/prisma/enums.js';

/** Campos del perfil que se guardan (todos opcionales; null borra). */
export interface ProfileData {
  occupation?: string | null;
  timezone?: string;
  publicName?: string | null;
  bio?: string | null;
  signatureUrl?: string | null;
  facebookUrl?: string | null;
  xUrl?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  autoplayNext?: boolean;
  reduceMotion?: boolean;
  theme?: ThemePreference;
  fontSize?: FontSize;
  highContrast?: boolean;
  colorFilter?: ColorFilter;
}

@Injectable()
export class ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProfile(userId: number) {
    return this.prisma.userProfile.findUnique({
      where: { userId },
      omit: { userId: true },
    });
  }

  upsertProfile(userId: number, data: ProfileData) {
    return this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      omit: { userId: true },
    });
  }

  /** Datos públicos de un docente (sin correo ni documento). */
  findTeacherPublic(id: number) {
    return this.prisma.user.findFirst({
      where: { id, role: 'TEACHER', status: 'ACTIVE' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profile: {
          select: {
            publicName: true,
            bio: true,
            occupation: true,
            facebookUrl: true,
            xUrl: true,
            linkedinUrl: true,
            githubUrl: true,
            websiteUrl: true,
          },
        },
      },
    });
  }

  /** Cursos publicados (y no privados) de un docente, como autor o instructor. */
  countPublishedCourses(teacherId: number) {
    return this.prisma.course.count({
      where: {
        ...managedBy(teacherId),
        status: 'PUBLISHED',
        visibility: { not: 'PRIVATE' },
      },
    });
  }
}
