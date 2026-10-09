import { BadRequestException, Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { createsCycle } from '../course-access/drip.js';
import { CourseModulesRepository } from './course-modules.repository.js';
import {
  CreateCourseModuleDto,
  UpdateCourseModuleDto,
} from './dto/course-module.dto.js';

@Injectable()
export class CourseModulesService {
  constructor(
    private readonly repository: CourseModulesRepository,
    private readonly access: CourseAccessService,
  ) {}

  async listByCourse(user: AuthenticatedUser, courseId: number) {
    await this.access.assertCanView(user, courseId);

    return this.repository.findByCourse(courseId);
  }

  /** Qué módulos tiene abiertos quien consulta (liberación gradual del contenido). */
  async availability(user: AuthenticatedUser, courseId: number) {
    return this.access.moduleAvailability(user, courseId);
  }

  /** Para otros módulos (courses): árbol de módulos y lecciones sin permisos. */
  outline(courseId: number, fullLessons = false) {
    return this.repository.findByCourse(courseId, fullLessons);
  }

  /** Para otros módulos (courses): ¿tiene contenido para publicarse? */
  countByCourse(courseId: number) {
    return this.repository.countByCourse(courseId);
  }

  async create(
    user: AuthenticatedUser,
    courseId: number,
    dto: CreateCourseModuleDto,
  ) {
    await this.access.assertCanManage(user, courseId);

    const requires = await this.checkRequires(courseId, undefined, dto.requiresModuleIds);
    const position =
      dto.position ?? (await this.repository.maxPosition(courseId)) + 1;

    return this.repository.create(
      {
        courseId,
        title: dto.title,
        description: dto.description,
        position,
        unlockAt: dto.unlockAt ? new Date(dto.unlockAt) : undefined,
        unlockAfterDays: dto.unlockAfterDays,
      },
      requires,
    );
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateCourseModuleDto) {
    const courseId = await this.access.courseIdOfModule(id);
    await this.access.assertCanManage(user, courseId);

    const requires = await this.checkRequires(courseId, id, dto.requiresModuleIds);

    return this.repository.update(
      id,
      {
        title: dto.title,
        description: dto.description,
        position: dto.position,
        // null quita el ajuste; sin enviarlo, no se toca.
        unlockAt:
          dto.unlockAt === undefined
            ? undefined
            : dto.unlockAt === null
              ? null
              : new Date(dto.unlockAt),
        unlockAfterDays: dto.unlockAfterDays,
      },
      requires,
    );
  }

  async remove(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfModule(id);
    await this.access.assertCanManage(user, courseId);

    await this.repository.delete(id);

    return { deleted: true };
  }

  /**
   * Los módulos que un módulo requiere deben ser de su mismo curso, no repetirse, no ser
   * él mismo ni formar un círculo (A pide B y B pide A, que dejaría ambos cerrados para siempre).
   * Devuelve la lista limpia, o `undefined` si no se envió.
   */
  private async checkRequires(
    courseId: number,
    moduleId: number | undefined,
    requiresModuleIds: number[] | undefined,
  ): Promise<number[] | undefined> {
    if (requiresModuleIds === undefined) {
      return undefined;
    }

    const ids = [...new Set(requiresModuleIds)];
    const valid = new Set(await this.repository.idsByCourse(courseId));

    if (ids.some((id) => !valid.has(id))) {
      throw new BadRequestException(
        'Los módulos requeridos deben ser de este mismo curso',
      );
    }

    if (
      moduleId !== undefined &&
      createsCycle(moduleId, ids, await this.repository.prerequisiteGraph(courseId))
    ) {
      throw new BadRequestException(
        'Esos prerrequisitos crean un círculo: un módulo no puede pedir, directa o indirectamente, terminarse a sí mismo',
      );
    }

    return ids;
  }
}
