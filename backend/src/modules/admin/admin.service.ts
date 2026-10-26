import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseStatus, Role, UserStatus } from '../../generated/prisma/enums.js';
import { AdminRepository } from './admin.repository.js';
import type { CreateUserDto, ListAdminCoursesQueryDto, ListUsersQueryDto, UpdateUserDto } from './dto/admin.dto.js';

const BCRYPT_ROUNDS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

type UserRow = NonNullable<Awaited<ReturnType<AdminRepository['findUser']>>>;

@Injectable()
export class AdminService {
  constructor(private readonly repository: AdminRepository) {}

  /** Las cifras de toda la plataforma. */
  async overview(now = new Date()) {
    const [byRole, byCourse, enrollments, completed, certificates, newUsers, recentUsers, recentCourses] = await Promise.all([
      this.repository.usersByRoleAndStatus(),
      this.repository.coursesByStatus(),
      this.repository.countEnrollments(),
      this.repository.countCompletedEnrollments(),
      this.repository.countCertificates(),
      this.repository.countUsersSince(new Date(now.getTime() - 30 * DAY_MS)),
      this.repository.recentUsers(5),
      this.repository.recentCourses(5),
    ]);

    const roles = { STUDENT: 0, TEACHER: 0, ADMIN: 0 };
    let inactive = 0;

    for (const row of byRole) {
      roles[row.role] += row._count._all;

      if (row.status === UserStatus.INACTIVE) {
        inactive += row._count._all;
      }
    }

    const courses = { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0 };

    for (const row of byCourse) {
      courses[row.status] = row._count._all;
    }

    return {
      users: { total: roles.STUDENT + roles.TEACHER + roles.ADMIN, ...roles, inactive, newLast30Days: newUsers },
      courses: { total: courses.DRAFT + courses.PUBLISHED + courses.ARCHIVED, ...courses },
      enrollments: { total: enrollments, completed, completionRate: enrollments === 0 ? 0 : Math.round((completed / enrollments) * 100) },
      certificates: { valid: certificates },
      recentUsers: recentUsers.map((user) => this.present(user)),
      recentCourses: recentCourses.map((course) => ({
        id: course.id,
        title: course.title,
        status: course.status,
        createdAt: course.createdAt,
        teacher: `${course.teacher.firstName} ${course.teacher.lastName}`.trim(),
      })),
    };
  }

  async users(query: ListUsersQueryDto) {
    const { items, total } = await this.repository.users({
      q: query.q,
      role: query.role,
      status: query.status,
      take: query.limit ?? 25,
      skip: query.offset ?? 0,
    });

    return { total, items: items.map((user) => this.present(user)) };
  }

  async createUser(dto: CreateUserDto) {
    if (await this.repository.findUserByEmail(dto.email)) {
      throw new ConflictException('Ya existe una cuenta con ese correo');
    }

    if (await this.repository.findUserByDocument(dto.document)) {
      throw new ConflictException('Ya existe una cuenta con ese documento');
    }

    const created = await this.repository.createUser({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      document: dto.document,
      phone: dto.phone || undefined,
      role: dto.role,
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
    });

    return this.present(created);
  }

  /**
   * Cambia el rol o el estado de otra cuenta. Uno no puede cambiar el suyo (así nadie se deja sin
   * acceso por error) y siempre debe quedar al menos un administrador activo.
   */
  async updateUser(actor: AuthenticatedUser, id: number, dto: UpdateUserDto) {
    if (dto.role === undefined && dto.status === undefined) {
      throw new BadRequestException('No hay nada que cambiar: envía role o status');
    }

    if (actor.id === id) {
      throw new BadRequestException('No puedes cambiar tu propio rol ni tu estado');
    }

    const target = await this.repository.findUser(id);

    if (!target) {
      throw new NotFoundException('La cuenta no existe');
    }

    const losesAdmin =
      target.role === Role.ADMIN &&
      target.status === UserStatus.ACTIVE &&
      ((dto.role !== undefined && dto.role !== Role.ADMIN) || dto.status === UserStatus.INACTIVE);

    if (losesAdmin && (await this.repository.countActiveAdmins()) <= 1) {
      throw new BadRequestException('Debe quedar al menos un administrador activo');
    }

    const deactivating = dto.status === UserStatus.INACTIVE && target.status !== UserStatus.INACTIVE;
    const updated = await this.repository.updateUser(id, { role: dto.role, status: dto.status }, deactivating);

    return this.present(updated);
  }

  async courses(query: ListAdminCoursesQueryDto) {
    const { items, total } = await this.repository.courses({
      q: query.q,
      status: query.status as CourseStatus | undefined,
      teacherId: query.teacherId,
      take: query.limit ?? 25,
      skip: query.offset ?? 0,
    });

    return {
      total,
      items: items.map((course) => ({
        id: course.id,
        title: course.title,
        slug: course.slug,
        status: course.status,
        price: course.price,
        createdAt: course.createdAt,
        teacher: course.teacher,
        category: course.category,
        enrollments: course._count.enrollments,
        modules: course._count.modules,
      })),
    };
  }

  private present(user: UserRow) {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      document: user.document,
      phone: user.phone,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      avatarUrl: user.profile?.avatarUrl ?? null,
      courses: user._count.courses,
      enrollments: user._count.enrollments,
      instructing: user._count.instructingCourses,
    };
  }
}
