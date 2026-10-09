import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role, UserStatus } from '../../generated/prisma/enums.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UsersService } from '../users/users.service.js';
import { CoursesRepository } from './courses.repository.js';

/** Máximo de instructores (sin contar al autor) que puede tener un curso. */
export const MAX_INSTRUCTORS = 10;

/**
 * Los instructores comparten la gestión de un curso con su autor: editan el contenido, califican,
 * publican anuncios y ven las métricas. Solo el autor (o un admin) agrega o quita instructores
 * y puede borrar el curso.
 */
@Injectable()
export class CourseInstructorsService {
  constructor(
    private readonly repository: CoursesRepository,
    private readonly access: CourseAccessService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  /** El equipo del curso: autor e instructores. Lo ve quien gestiona el curso. */
  async team(user: AuthenticatedUser, courseId: number) {
    await this.access.assertCanManage(user, courseId);

    return this.getTeam(courseId);
  }

  /** Agrega a un docente (por su correo) como instructor. Solo el autor o un admin. */
  async add(user: AuthenticatedUser, courseId: number, email: string) {
    const course = await this.access.assertIsOwner(user, courseId);
    const target = await this.users.findByEmail(email);

    if (!target) {
      throw new NotFoundException('No hay ninguna cuenta con ese correo');
    }

    if (target.role !== Role.TEACHER) {
      throw new BadRequestException(
        'Solo se pueden agregar docentes como instructores',
      );
    }

    if (target.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Esa cuenta está inactiva');
    }

    if (target.id === course.teacherId) {
      throw new BadRequestException('Esa persona ya es la autora del curso');
    }

    if (course.instructorIds.includes(target.id)) {
      throw new BadRequestException('Esa persona ya es instructora del curso');
    }

    if (course.instructorIds.length >= MAX_INSTRUCTORS) {
      throw new BadRequestException(
        `Un curso puede tener hasta ${MAX_INSTRUCTORS} instructores`,
      );
    }

    await this.repository.addInstructor(courseId, target.id);

    await this.notifications.notify(
      [target.id],
      {
        type: 'INSTRUCTOR_ADDED',
        title: 'Te agregaron como instructor',
        message: `Ahora puedes gestionar «${course.title}»`,
        courseId,
      },
      user.id,
    );

    return this.getTeam(courseId);
  }

  /**
   * Quita a un instructor. Lo hace el autor (o un admin), o el propio instructor para salirse
   * del curso. Al autor no se le puede quitar.
   */
  async remove(user: AuthenticatedUser, courseId: number, userId: number) {
    const course = await this.access.getCourseOrThrow(courseId);

    if (userId === course.teacherId) {
      throw new BadRequestException('Al autor del curso no se le puede quitar');
    }

    const leavingByOwnWill =
      user.id === userId && course.instructorIds.includes(userId);

    if (!this.access.isOwner(user, course) && !leavingByOwnWill) {
      throw new ForbiddenException(
        'Solo el autor del curso puede quitar instructores',
      );
    }

    if ((await this.repository.removeInstructor(courseId, userId)) === 0) {
      throw new NotFoundException('Esa persona no es instructora de este curso');
    }

    return leavingByOwnWill && !this.access.isOwner(user, course)
      ? { left: true }
      : this.getTeam(courseId);
  }

  private async getTeam(courseId: number) {
    const team = await this.repository.findTeam(courseId);

    if (!team) {
      throw new NotFoundException('El curso no existe');
    }

    return team;
  }
}
