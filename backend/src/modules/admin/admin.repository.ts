import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { CourseStatus, Role, UserStatus } from '../../generated/prisma/enums.js';

/** Todo lo que se devuelve de una cuenta, salvo lo secreto. */
const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  document: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  profile: { select: { avatarUrl: true } },
  _count: { select: { courses: true, enrollments: true, instructingCourses: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Resumen ----------

  async usersByRoleAndStatus() {
    return this.prisma.user.groupBy({ by: ['role', 'status'], _count: { _all: true } });
  }

  async coursesByStatus() {
    return this.prisma.course.groupBy({ by: ['status'], _count: { _all: true } });
  }

  countEnrollments() {
    return this.prisma.enrollment.count();
  }

  countCompletedEnrollments() {
    return this.prisma.enrollment.count({ where: { completedAt: { not: null } } });
  }

  countCertificates() {
    return this.prisma.certificate.count({ where: { status: 'VALID' } });
  }

  countUsersSince(since: Date) {
    return this.prisma.user.count({ where: { createdAt: { gte: since } } });
  }

  recentUsers(take: number) {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take, select: userSelect });
  }

  recentCourses(take: number) {
    return this.prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, title: true, status: true, createdAt: true, teacher: { select: { firstName: true, lastName: true } } },
    });
  }

  // ---------- Usuarios ----------

  private usersWhere(filter: { q?: string; role?: Role; status?: UserStatus }): Prisma.UserWhereInput {
    const q = filter.q?.trim();

    return {
      role: filter.role,
      status: filter.status,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { document: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  async users(filter: { q?: string; role?: Role; status?: UserStatus; take: number; skip: number }) {
    const where = this.usersWhere(filter);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: filter.take, skip: filter.skip, select: userSelect }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  findUser(id: number) {
    return this.prisma.user.findUnique({ where: { id }, select: userSelect });
  }

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email }, select: { id: true } });
  }

  findUserByDocument(document: string) {
    return this.prisma.user.findUnique({ where: { document }, select: { id: true } });
  }

  createUser(data: {
    firstName: string;
    lastName: string;
    email: string;
    document: string;
    phone?: string;
    role: Role;
    passwordHash: string;
  }) {
    return this.prisma.user.create({ data, select: userSelect });
  }

  /** Al desactivar una cuenta se sube `sessionVersion`: sus sesiones abiertas dejan de valer. */
  updateUser(id: number, data: { role?: Role; status?: UserStatus }, closeSessions: boolean) {
    return this.prisma.user.update({
      where: { id },
      data: { ...data, ...(closeSessions ? { sessionVersion: { increment: 1 } } : {}) },
      select: userSelect,
    });
  }

  countActiveAdmins() {
    return this.prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
  }

  // ---------- Cursos ----------

  async courses(filter: { q?: string; status?: CourseStatus; teacherId?: number; take: number; skip: number }) {
    const q = filter.q?.trim();
    const where: Prisma.CourseWhereInput = {
      status: filter.status,
      teacherId: filter.teacherId,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { teacher: { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: filter.take,
        skip: filter.skip,
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          price: true,
          createdAt: true,
          teacher: { select: { id: true, firstName: true, lastName: true, email: true } },
          category: { select: { id: true, name: true } },
          _count: { select: { enrollments: true, modules: true } },
        },
      }),
      this.prisma.course.count({ where }),
    ]);

    return { items, total };
  }
}
