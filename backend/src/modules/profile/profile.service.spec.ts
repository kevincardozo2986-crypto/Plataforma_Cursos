import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import type { DashboardService } from '../dashboard/dashboard.service.js';
import type { UsersService } from '../users/users.service.js';
import type { ProfileRepository } from './profile.repository.js';
import { ProfileService } from './profile.service.js';

const student = { id: 5, role: Role.STUDENT } as AuthenticatedUser;
const teacher = { id: 7, role: Role.TEACHER } as AuthenticatedUser;
const admin = { id: 1, role: Role.ADMIN } as AuthenticatedUser;

const account = { id: 7, firstName: 'Laura', lastName: 'Gómez', email: 'laura@campus.com', phone: null, role: Role.TEACHER, createdAt: new Date('2026-01-01') };

function build() {
  const repository = {
    findProfile: vi.fn().mockResolvedValue(null),
    upsertProfile: vi.fn().mockResolvedValue({}),
    findTeacherPublic: vi.fn(),
    countPublishedCourses: vi.fn().mockResolvedValue(3),
  };
  const users = {
    findById: vi.fn().mockResolvedValue(account),
    updateBasics: vi.fn().mockResolvedValue({}),
    findWithPasswordHash: vi.fn(),
    updatePasswordHash: vi.fn().mockResolvedValue(undefined),
  };
  const dashboard = {
    teacher: vi.fn().mockResolvedValue({ courses: { total: 4 }, students: 30, rating: { average: 4.5, count: 12 } }),
  };
  const service = new ProfileService(
    repository as unknown as ProfileRepository,
    users as unknown as UsersService,
    dashboard as unknown as DashboardService,
  );

  return { service, repository, users, dashboard };
}

describe('ProfileService', () => {
  describe('get', () => {
    it('sin perfil guardado devuelve los valores por defecto', async () => {
      const { service } = build();

      const result = await service.get(teacher);

      expect(result.profile).toMatchObject({ timezone: 'America/Bogota', bio: null, signatureUrl: null });
      expect(result.preferences).toEqual({
        autoplayNext: true, reduceMotion: false, theme: 'SYSTEM', fontSize: 'MEDIUM', highContrast: false, colorFilter: 'NONE',
      });
    });

    it('no expone el hash de la contraseña ni el documento', async () => {
      const { service, users } = build();
      users.findById.mockResolvedValue({ ...account, passwordHash: 'secreto', document: '123' });

      const json = JSON.stringify(await service.get(teacher));

      expect(json).not.toContain('secreto');
      expect(json).not.toContain('"document"');
    });

    it('un docente ve sus estadísticas; un estudiante no', async () => {
      const { service, dashboard } = build();

      expect((await service.get(teacher)).stats).toEqual({ courses: 4, students: 30, rating: { average: 4.5, count: 12 } });
      expect((await service.get(student)).stats).toBeNull();
      expect((await service.get(admin)).stats).toBeNull();
      expect(dashboard.teacher).toHaveBeenCalledTimes(1);
    });

    it('mezcla lo guardado con los valores por defecto', async () => {
      const { service, repository } = build();
      repository.findProfile.mockResolvedValue({ bio: 'Hola', theme: 'DARK', githubUrl: 'https://github.com/laura' });

      const result = await service.get(teacher);

      expect(result.profile).toMatchObject({ bio: 'Hola', social: { githubUrl: 'https://github.com/laura', xUrl: null } });
      expect(result.preferences).toMatchObject({ theme: 'DARK', fontSize: 'MEDIUM' });
    });
  });

  describe('update', () => {
    it('los datos de la cuenta van al usuario y el resto al perfil', async () => {
      const { service, users, repository } = build();

      await service.update(teacher, { firstName: 'Lauren', phone: '3001234567', bio: 'Docente', theme: 'DARK' });

      expect(users.updateBasics).toHaveBeenCalledWith(7, { firstName: 'Lauren', lastName: undefined, phone: '3001234567' });
      expect(repository.upsertProfile).toHaveBeenCalledWith(7, { bio: 'Docente', theme: 'DARK' });
    });

    it('si solo cambia datos de la cuenta, no toca el perfil; y al revés', async () => {
      const { service, users, repository } = build();

      await service.update(teacher, { lastName: 'Pérez' });
      expect(repository.upsertProfile).not.toHaveBeenCalled();

      await service.update(teacher, { bio: 'Hola' });
      expect(users.updateBasics).toHaveBeenCalledTimes(1);
    });

    it('un cuerpo vacío no escribe nada', async () => {
      const { service, users, repository } = build();

      await service.update(teacher, {});

      expect(users.updateBasics).not.toHaveBeenCalled();
      expect(repository.upsertProfile).not.toHaveBeenCalled();
    });

    it('null borra un dato (se guarda tal cual)', async () => {
      const { service, repository } = build();

      await service.update(teacher, { bio: null, signatureUrl: null });

      expect(repository.upsertProfile).toHaveBeenCalledWith(7, { bio: null, signatureUrl: null });
    });

    it('la firma es solo de docentes (y admin): un estudiante recibe 403', async () => {
      const { service, repository } = build();

      await expect(service.update(student, { signatureUrl: '/api/uploads/a1b2c3d4e5f60718293a4b5c6d7e8f90.webp' })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.update(teacher, { signatureUrl: '/api/uploads/a1b2c3d4e5f60718293a4b5c6d7e8f90.webp' })).resolves.toBeDefined();
      expect(repository.upsertProfile).toHaveBeenCalledTimes(1);
    });

    it('un estudiante sí puede guardar preferencias y quitar su firma (null)', async () => {
      const { service, repository } = build();

      await service.update(student, { theme: 'DARK', signatureUrl: null });

      expect(repository.upsertProfile).toHaveBeenCalledWith(5, { theme: 'DARK', signatureUrl: null });
    });
  });

  describe('changePassword', () => {
    it('con la contraseña actual correcta guarda la nueva, cifrada', async () => {
      const { service, users } = build();
      users.findWithPasswordHash.mockResolvedValue({ passwordHash: await bcrypt.hash('ClaveVieja1', 4) });

      await expect(service.changePassword(teacher, { currentPassword: 'ClaveVieja1', newPassword: 'ClaveNueva2' })).resolves.toEqual({ changed: true });

      const [, hash] = users.updatePasswordHash.mock.calls[0];
      expect(hash).not.toBe('ClaveNueva2');
      expect(await bcrypt.compare('ClaveNueva2', hash)).toBe(true);
    });

    it('con la actual incorrecta se rechaza y no cambia nada', async () => {
      const { service, users } = build();
      users.findWithPasswordHash.mockResolvedValue({ passwordHash: await bcrypt.hash('ClaveVieja1', 4) });

      await expect(service.changePassword(teacher, { currentPassword: 'otra', newPassword: 'ClaveNueva2' })).rejects.toBeInstanceOf(BadRequestException);
      expect(users.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('la nueva debe ser distinta de la actual', async () => {
      const { service, users } = build();
      users.findWithPasswordHash.mockResolvedValue({ passwordHash: await bcrypt.hash('ClaveVieja1', 4) });

      await expect(service.changePassword(teacher, { currentPassword: 'ClaveVieja1', newPassword: 'ClaveVieja1' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('publicTeacher', () => {
    it('muestra el nombre público, la biografía y las redes, sin correo', async () => {
      const { service, repository } = build();
      repository.findTeacherPublic.mockResolvedValue({
        id: 7, firstName: 'Laura', lastName: 'Gómez',
        profile: { publicName: 'Dra. Laura Gómez', bio: 'Ingeniera', occupation: 'Docente', githubUrl: 'https://github.com/laura' },
      });

      const result = await service.publicTeacher(7);

      expect(result).toMatchObject({ id: 7, name: 'Dra. Laura Gómez', bio: 'Ingeniera', publishedCourses: 3 });
      expect(result.social.githubUrl).toBe('https://github.com/laura');
      expect(JSON.stringify(result)).not.toContain('@');
    });

    it('sin nombre público usa nombre y apellido', async () => {
      const { service, repository } = build();
      repository.findTeacherPublic.mockResolvedValue({ id: 7, firstName: 'Laura', lastName: 'Gómez', profile: null });

      expect((await service.publicTeacher(7)).name).toBe('Laura Gómez');
    });

    it('alguien que no es docente "no existe"', async () => {
      const { service, repository } = build();
      repository.findTeacherPublic.mockResolvedValue(null);

      await expect(service.publicTeacher(5)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
