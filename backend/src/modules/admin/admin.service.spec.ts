import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role, UserStatus } from '../../generated/prisma/enums.js';
import type { AdminRepository } from './admin.repository.js';
import { AdminService } from './admin.service.js';

const admin = { id: 1, role: Role.ADMIN } as AuthenticatedUser;
const now = new Date('2026-10-22T12:00:00.000Z');

const user = (overrides: Record<string, unknown> = {}) => ({
  id: 9, firstName: 'Luis', lastName: 'Pérez', email: 'luis@campus.com', document: '123456', phone: null,
  role: Role.TEACHER, status: UserStatus.ACTIVE, createdAt: now, profile: null,
  _count: { courses: 2, enrollments: 0, instructingCourses: 1 }, ...overrides,
});

function build() {
  const repository = {
    usersByRoleAndStatus: vi.fn().mockResolvedValue([
      { role: 'STUDENT', status: 'ACTIVE', _count: { _all: 8 } },
      { role: 'STUDENT', status: 'INACTIVE', _count: { _all: 2 } },
      { role: 'TEACHER', status: 'ACTIVE', _count: { _all: 3 } },
      { role: 'ADMIN', status: 'ACTIVE', _count: { _all: 1 } },
    ]),
    coursesByStatus: vi.fn().mockResolvedValue([{ status: 'PUBLISHED', _count: { _all: 4 } }, { status: 'DRAFT', _count: { _all: 2 } }]),
    countEnrollments: vi.fn().mockResolvedValue(20),
    countCompletedEnrollments: vi.fn().mockResolvedValue(5),
    countCertificates: vi.fn().mockResolvedValue(4),
    countUsersSince: vi.fn().mockResolvedValue(6),
    recentUsers: vi.fn().mockResolvedValue([user()]),
    recentCourses: vi.fn().mockResolvedValue([{ id: 1, title: 'Angular', status: 'PUBLISHED', createdAt: now, teacher: { firstName: 'Luis', lastName: 'Pérez' } }]),
    users: vi.fn().mockResolvedValue({ items: [user()], total: 1 }),
    findUser: vi.fn().mockResolvedValue(user()),
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUserByDocument: vi.fn().mockResolvedValue(null),
    createUser: vi.fn((data: Record<string, unknown>) => Promise.resolve(user(data))),
    updateUser: vi.fn((_id: number, data: Record<string, unknown>) => Promise.resolve(user(data))),
    countActiveAdmins: vi.fn().mockResolvedValue(2),
    courses: vi.fn().mockResolvedValue({
      total: 1,
      items: [{ id: 1, title: 'Angular', slug: 'angular', status: 'PUBLISHED', price: '0', createdAt: now, teacher: { id: 9, firstName: 'Luis', lastName: 'Pérez', email: 'l@c.com' }, category: null, _count: { enrollments: 3, modules: 2 } }],
    }),
  };

  return { service: new AdminService(repository as unknown as AdminRepository), repository };
}

describe('AdminService', () => {
  describe('overview', () => {
    it('suma las cuentas por rol, las inactivas, los cursos y las inscripciones', async () => {
      const { service } = build();

      const result = await service.overview(now);

      expect(result.users).toEqual({ total: 14, STUDENT: 10, TEACHER: 3, ADMIN: 1, inactive: 2, newLast30Days: 6 });
      expect(result.courses).toEqual({ total: 6, DRAFT: 2, PUBLISHED: 4, ARCHIVED: 0 });
      expect(result.enrollments).toEqual({ total: 20, completed: 5, completionRate: 25 });
      expect(result.certificates).toEqual({ valid: 4 });
      expect(result.recentCourses[0]).toMatchObject({ title: 'Angular', teacher: 'Luis Pérez' });
    });

    it('cuenta los usuarios nuevos de los últimos 30 días', async () => {
      const { service, repository } = build();

      await service.overview(now);

      expect((repository.countUsersSince.mock.calls[0][0] as Date).toISOString()).toBe('2026-09-22T12:00:00.000Z');
    });

    it('sin inscripciones, la finalización es 0 y no falla', async () => {
      const { service, repository } = build();
      repository.countEnrollments.mockResolvedValue(0);
      repository.countCompletedEnrollments.mockResolvedValue(0);

      expect((await service.overview(now)).enrollments.completionRate).toBe(0);
    });

    it('nunca devuelve secretos de las cuentas', async () => {
      const { service } = build();

      expect(JSON.stringify(await service.overview(now))).not.toMatch(/passwordHash|sessionVersion/);
    });
  });

  describe('users', () => {
    it('pagina con 25 por defecto y pasa los filtros', async () => {
      const { service, repository } = build();

      await service.users({ q: 'luis', role: Role.TEACHER, status: UserStatus.ACTIVE, limit: 10, offset: 20 });
      expect(repository.users).toHaveBeenLastCalledWith({ q: 'luis', role: Role.TEACHER, status: UserStatus.ACTIVE, take: 10, skip: 20 });

      await service.users({});
      expect(repository.users).toHaveBeenLastCalledWith(expect.objectContaining({ take: 25, skip: 0 }));
    });

    it('cada cuenta trae sus conteos y su foto (null si no tiene)', async () => {
      const { service } = build();

      const result = await service.users({});

      expect(result.items[0]).toMatchObject({ id: 9, courses: 2, enrollments: 0, instructing: 1, avatarUrl: null });
    });
  });

  describe('createUser', () => {
    const dto = { firstName: 'Ana', lastName: 'Ruiz', email: 'ana@campus.com', document: '99887766', role: Role.TEACHER, password: 'Campus2026*' };

    it('crea la cuenta con el rol elegido y la contraseña cifrada (nunca en claro)', async () => {
      const { service, repository } = build();

      await service.createUser(dto);

      const data = repository.createUser.mock.calls[0][0] as { passwordHash: string; role: string };

      expect(data.role).toBe(Role.TEACHER);
      expect(data.passwordHash).not.toBe(dto.password);
      expect(await bcrypt.compare(dto.password, data.passwordHash)).toBe(true);
    });

    it('rechaza un correo o un documento que ya existe (409)', async () => {
      const { service, repository } = build();

      repository.findUserByEmail.mockResolvedValue({ id: 3 });
      await expect(service.createUser(dto)).rejects.toBeInstanceOf(ConflictException);

      repository.findUserByEmail.mockResolvedValue(null);
      repository.findUserByDocument.mockResolvedValue({ id: 3 });
      await expect(service.createUser(dto)).rejects.toBeInstanceOf(ConflictException);
      expect(repository.createUser).not.toHaveBeenCalled();
    });
  });

  describe('updateUser', () => {
    it('cambia el rol de otra cuenta', async () => {
      const { service, repository } = build();

      await service.updateUser(admin, 9, { role: Role.STUDENT });

      expect(repository.updateUser).toHaveBeenCalledWith(9, { role: Role.STUDENT, status: undefined }, false);
    });

    it('desactivar una cuenta cierra sus sesiones; reactivarla no', async () => {
      const { service, repository } = build();

      await service.updateUser(admin, 9, { status: UserStatus.INACTIVE });
      expect(repository.updateUser).toHaveBeenLastCalledWith(9, { role: undefined, status: UserStatus.INACTIVE }, true);

      repository.findUser.mockResolvedValue(user({ status: UserStatus.INACTIVE }));
      await service.updateUser(admin, 9, { status: UserStatus.ACTIVE });
      expect(repository.updateUser).toHaveBeenLastCalledWith(9, { role: undefined, status: UserStatus.ACTIVE }, false);
    });

    it('desactivar una cuenta que ya está inactiva no vuelve a cerrar sesiones', async () => {
      const { service, repository } = build();
      repository.findUser.mockResolvedValue(user({ status: UserStatus.INACTIVE }));

      await service.updateUser(admin, 9, { status: UserStatus.INACTIVE });

      expect(repository.updateUser).toHaveBeenCalledWith(9, expect.anything(), false);
    });

    it('uno no cambia su propia cuenta', async () => {
      const { service, repository } = build();

      await expect(service.updateUser(admin, 1, { role: Role.STUDENT })).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.updateUser).not.toHaveBeenCalled();
    });

    it('sin nada que cambiar se rechaza', async () => {
      const { service } = build();

      await expect(service.updateUser(admin, 9, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('una cuenta que no existe responde 404', async () => {
      const { service, repository } = build();
      repository.findUser.mockResolvedValue(null);

      await expect(service.updateUser(admin, 99, { role: Role.STUDENT })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('no se deja sin administradores: el último activo no pierde el rol ni se desactiva', async () => {
      const { service, repository } = build();
      repository.findUser.mockResolvedValue(user({ role: Role.ADMIN }));
      repository.countActiveAdmins.mockResolvedValue(1);

      await expect(service.updateUser(admin, 9, { role: Role.TEACHER })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updateUser(admin, 9, { status: UserStatus.INACTIVE })).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.updateUser).not.toHaveBeenCalled();
    });

    it('con otro administrador activo, sí se le puede quitar el rol a uno', async () => {
      const { service, repository } = build();
      repository.findUser.mockResolvedValue(user({ role: Role.ADMIN }));
      repository.countActiveAdmins.mockResolvedValue(2);

      await expect(service.updateUser(admin, 9, { role: Role.TEACHER })).resolves.toBeDefined();
    });

    it('subir a alguien a administrador no depende de cuántos haya', async () => {
      const { service, repository } = build();
      repository.countActiveAdmins.mockResolvedValue(1);

      await expect(service.updateUser(admin, 9, { role: Role.ADMIN })).resolves.toBeDefined();
    });
  });

  describe('courses', () => {
    it('lista todos los cursos con su autor y sus conteos', async () => {
      const { service } = build();

      const result = await service.courses({});

      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({ title: 'Angular', enrollments: 3, modules: 2, teacher: { firstName: 'Luis' } });
    });

    it('pasa el filtro de estado, de autor y la búsqueda', async () => {
      const { service, repository } = build();

      await service.courses({ q: 'ang', status: 'PUBLISHED', teacherId: 9, limit: 5, offset: 10 });

      expect(repository.courses).toHaveBeenCalledWith({ q: 'ang', status: 'PUBLISHED', teacherId: 9, take: 5, skip: 10 });
    });
  });
});
