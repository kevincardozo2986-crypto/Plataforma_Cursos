import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { UsersService } from '../users/users.service.js';
import { CourseInstructorsService, MAX_INSTRUCTORS } from './course-instructors.service.js';
import type { CoursesRepository } from './courses.repository.js';

const owner = { id: 7, role: Role.TEACHER } as AuthenticatedUser;
const admin = { id: 1, role: Role.ADMIN } as AuthenticatedUser;
const instructor = { id: 8, role: Role.TEACHER } as AuthenticatedUser;
const stranger = { id: 99, role: Role.TEACHER } as AuthenticatedUser;

const course = { id: 3, title: 'Angular', teacherId: 7, instructorIds: [8] };
const candidate = { id: 20, role: Role.TEACHER, status: 'ACTIVE' };

function build() {
  const repository = {
    findTeam: vi.fn().mockResolvedValue({ owner: { id: 7 }, instructors: [] }),
    addInstructor: vi.fn().mockResolvedValue({}),
    removeInstructor: vi.fn().mockResolvedValue(1),
  };
  const access = {
    assertCanManage: vi.fn().mockResolvedValue(course),
    assertIsOwner: vi.fn().mockResolvedValue(course),
    getCourseOrThrow: vi.fn().mockResolvedValue(course),
    isOwner: vi.fn((user: AuthenticatedUser, c: { teacherId: number }) => user.role === Role.ADMIN || c.teacherId === user.id),
  };
  const users = { findByEmail: vi.fn().mockResolvedValue(candidate) };
  const notifications = { notify: vi.fn().mockResolvedValue(1) };

  const service = new CourseInstructorsService(
    repository as unknown as CoursesRepository,
    access as unknown as CourseAccessService,
    users as unknown as UsersService,
    notifications as unknown as NotificationsService,
  );

  return { service, repository, access, users, notifications };
}

describe('CourseInstructorsService', () => {
  describe('add', () => {
    it('el autor agrega a un docente por su correo y se le avisa', async () => {
      const { service, repository, notifications } = build();

      await service.add(owner, 3, 'luis@campus.com');

      expect(repository.addInstructor).toHaveBeenCalledWith(3, 20);
      expect(notifications.notify).toHaveBeenCalledWith(
        [20],
        { type: 'INSTRUCTOR_ADDED', title: 'Te agregaron como instructor', message: 'Ahora puedes gestionar «Angular»', courseId: 3 },
        7,
      );
    });

    it('solo el autor o un admin: un instructor no puede agregar a otros', async () => {
      const { service, access, repository } = build();
      access.assertIsOwner.mockRejectedValue(new ForbiddenException());

      await expect(service.add(instructor, 3, 'luis@campus.com')).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.addInstructor).not.toHaveBeenCalled();
    });

    it('un correo sin cuenta responde 404', async () => {
      const { service, users } = build();
      users.findByEmail.mockResolvedValue(null);

      await expect(service.add(owner, 3, 'nadie@campus.com')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('solo se agregan docentes: un estudiante o un admin se rechazan', async () => {
      const { service, users, repository } = build();

      for (const role of [Role.STUDENT, Role.ADMIN]) {
        users.findByEmail.mockResolvedValue({ ...candidate, role });
        await expect(service.add(owner, 3, 'x@campus.com')).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(repository.addInstructor).not.toHaveBeenCalled();
    });

    it('una cuenta inactiva se rechaza', async () => {
      const { service, users } = build();
      users.findByEmail.mockResolvedValue({ ...candidate, status: 'INACTIVE' });

      await expect(service.add(owner, 3, 'x@campus.com')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('el autor no se puede agregar a sí mismo, ni se repite un instructor', async () => {
      const { service, users } = build();

      users.findByEmail.mockResolvedValue({ ...candidate, id: 7 });
      await expect(service.add(owner, 3, 'yo@campus.com')).rejects.toBeInstanceOf(BadRequestException);

      users.findByEmail.mockResolvedValue({ ...candidate, id: 8 });
      await expect(service.add(owner, 3, 'ya@campus.com')).rejects.toBeInstanceOf(BadRequestException);
    });

    it(`un curso admite hasta ${MAX_INSTRUCTORS} instructores`, async () => {
      const { service, access } = build();
      access.assertIsOwner.mockResolvedValue({ ...course, instructorIds: Array.from({ length: MAX_INSTRUCTORS }, (_, i) => 100 + i) });

      await expect(service.add(owner, 3, 'x@campus.com')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('un admin también puede agregar (aunque no sea el autor)', async () => {
      const { service, repository } = build();

      await service.add(admin, 3, 'luis@campus.com');

      expect(repository.addInstructor).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('el autor quita a un instructor y recibe el equipo actualizado', async () => {
      const { service, repository } = build();

      await expect(service.remove(owner, 3, 8)).resolves.toMatchObject({ owner: { id: 7 } });
      expect(repository.removeInstructor).toHaveBeenCalledWith(3, 8);
    });

    it('un instructor puede salirse él mismo del curso', async () => {
      const { service, repository } = build();

      await expect(service.remove(instructor, 3, 8)).resolves.toEqual({ left: true });
      expect(repository.removeInstructor).toHaveBeenCalledWith(3, 8);
    });

    it('un instructor no puede quitar a otro', async () => {
      const { service, access, repository } = build();
      access.getCourseOrThrow.mockResolvedValue({ ...course, instructorIds: [8, 9] });

      await expect(service.remove(instructor, 3, 9)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.removeInstructor).not.toHaveBeenCalled();
    });

    it('un docente ajeno al curso no puede quitar a nadie', async () => {
      const { service } = build();

      await expect(service.remove(stranger, 3, 8)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('al autor no se le puede quitar', async () => {
      const { service } = build();

      await expect(service.remove(owner, 3, 7)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.remove(admin, 3, 7)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('quitar a quien no es instructor responde 404', async () => {
      const { service, repository } = build();
      repository.removeInstructor.mockResolvedValue(0);

      await expect(service.remove(owner, 3, 55)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('el equipo lo ve quien gestiona el curso', async () => {
    const { service, access } = build();

    await service.team(instructor, 3);
    expect(access.assertCanManage).toHaveBeenCalledWith(instructor, 3);

    access.assertCanManage.mockRejectedValue(new ForbiddenException());
    await expect(service.team(stranger, 3)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
