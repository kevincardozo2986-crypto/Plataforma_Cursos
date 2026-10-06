import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import {
  CourseStatus,
  CourseVisibility,
  Role,
} from '../../generated/prisma/enums.js';
import { hasVisibleText } from '../../common/dto/sanitize-html.js';
import { slugify } from '../../common/utils/slugify.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CategoriesService } from '../categories/categories.service.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { CourseModulesService } from '../course-modules/course-modules.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { CoursesRepository } from './courses.repository.js';
import {
  CreateCourseDto,
  ListCoursesQueryDto,
  UpdateCourseDto,
} from './dto/course.dto.js';

/** Título con el que nace un borrador creado desde el asistente. */
export const DRAFT_TITLE = 'Curso sin título';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class CoursesService {
  constructor(
    private readonly repository: CoursesRepository,
    private readonly access: CourseAccessService,
    private readonly categories: CategoriesService,
    private readonly modules: CourseModulesService,
    private readonly progress: ProgressService,
  ) {}

  async listPublished(query: ListCoursesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;

    const { data, total } = await this.repository.listPublished(
      {
        categoryId: query.categoryId,
        level: query.level,
        search: query.search,
      },
      (page - 1) * limit,
      limit,
    );

    return { data, total, page, limit };
  }

  async findPublished(id: number) {
    const course = await this.repository.findPublishedById(id);

    if (!course) {
      throw new NotFoundException('El curso no existe');
    }

    return { ...course, modules: await this.modules.outline(id) };
  }

  listManaged(user: AuthenticatedUser) {
    return this.repository.listManaged(
      user.role === Role.ADMIN ? undefined : user.id,
    );
  }

  async findManaged(user: AuthenticatedUser, id: number) {
    await this.access.assertCanManage(user, id);

    const course = await this.repository.findById(id);

    if (!course) {
      throw new NotFoundException('El curso no existe');
    }

    return {
      ...this.toManaged(course),
      modules: await this.modules.outline(id, true),
    };
  }

  async create(user: AuthenticatedUser, dto: CreateCourseDto) {
    await this.assertCategoryExists(dto.categoryId);

    return this.repository.create({
      title: dto.title,
      description: dto.description,
      imageUrl: dto.imageUrl,
      price: dto.price,
      level: dto.level,
      categoryId: dto.categoryId,
      slug: await this.uniqueSlug(dto.title),
      teacherId: user.id,
    });
  }

  /**
   * Borrador vacío: lo pide el asistente al abrirse; el profesor lo va completando.
   * Si ya tiene uno sin tocar, lo reutiliza: abrir el asistente varias veces sin escribir
   * nada no deja borradores huérfanos.
   */
  async createDraft(user: AuthenticatedUser) {
    const untouched = await this.repository.findUntouchedDraft(
      user.id,
      DRAFT_TITLE,
    );

    if (untouched) {
      return untouched;
    }

    return this.repository.create({
      title: DRAFT_TITLE,
      description: '',
      price: 0,
      slug: await this.uniqueSlug(DRAFT_TITLE),
      teacherId: user.id,
    });
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateCourseDto) {
    await this.access.assertCanManage(user, id);
    await this.assertCategoryExists(dto.categoryId);

    const current = await this.repository.findById(id);

    if (!current) {
      throw new NotFoundException('El curso no existe');
    }

    await this.assertSlugFree(dto.slug, id);
    const prerequisiteIds = await this.checkPrerequisites(dto.prerequisiteIds, id);

    const visibility = dto.visibility ?? current.visibility;
    const accessPassword = await this.resolvePassword(
      visibility,
      dto.accessPassword,
      current.accessPassword,
    );

    const updated = await this.repository.update(
      id,
      {
        // Estos campos no admiten null: si llegan nulos, no se tocan.
        title: dto.title ?? undefined,
        slug: dto.slug ?? undefined,
        description: dto.description ?? undefined,
        price: dto.price ?? undefined,
        level: dto.level ?? undefined,
        visibility: dto.visibility ?? undefined,
        publicContent: dto.publicContent ?? undefined,
        qaEnabled: dto.qaEnabled ?? undefined,
        // Estos sí: null los borra.
        imageUrl: dto.imageUrl,
        introVideoUrl: dto.introVideoUrl,
        categoryId: dto.categoryId,
        maxStudents: dto.maxStudents,
        whatYouWillLearn: dto.whatYouWillLearn,
        audience: dto.audience,
        durationMinutes: dto.durationMinutes,
        materials: dto.materials,
        requirements: dto.requirements,
        accessPassword,
      },
      prerequisiteIds,
    );

    return this.toManaged(updated);
  }

  async updateStatus(
    user: AuthenticatedUser,
    id: number,
    status: CourseStatus,
  ) {
    await this.access.assertCanManage(user, id);

    if (status === CourseStatus.PUBLISHED) {
      await this.assertReadyToPublish(id);
    }

    return this.repository.updateStatus(id, status);
  }

  async remove(user: AuthenticatedUser, id: number) {
    await this.access.assertCanManage(user, id);

    if ((await this.progress.countEnrollments(id)) > 0) {
      throw new ConflictException(
        'El curso tiene estudiantes inscritos; archívalo en lugar de eliminarlo',
      );
    }

    await this.repository.delete(id);

    return { deleted: true };
  }

  /** Dice exactamente qué falta, para que el profesor sepa qué completar. */
  private async assertReadyToPublish(id: number) {
    const course = await this.repository.findById(id);
    const missing: string[] = [];

    if (!course?.title.trim() || course.title === DRAFT_TITLE) {
      missing.push('un título');
    }
    if (!course || !hasVisibleText(course.description)) {
      missing.push('una descripción');
    }
    if ((await this.modules.countByCourse(id)) === 0) {
      missing.push('al menos un módulo');
    }

    if (missing.length > 0) {
      throw new BadRequestException(`Para publicar falta: ${missing.join(', ')}`);
    }
  }

  /** Nunca devuelve el hash: expone solo si hay contraseña y los prerrequisitos ya resueltos. */
  private toManaged<
    T extends {
      accessPassword?: string | null;
      requires?: { prerequisite: { id: number; title: string } }[];
    },
  >(course: T) {
    const { accessPassword, requires, ...rest } = course;

    return {
      ...rest,
      hasPassword: Boolean(accessPassword),
      prerequisites: (requires ?? []).map((item) => item.prerequisite),
    };
  }

  /**
   * Decide qué guardar en `accessPassword`:
   * - visibilidad con contraseña y se envió una → se cifra y se guarda;
   * - con contraseña y no se envió, pero ya había → se conserva (undefined);
   * - con contraseña y no hay ninguna → error;
   * - otra visibilidad → se borra la que hubiera.
   */
  private async resolvePassword(
    visibility: CourseVisibility,
    provided: string | undefined,
    existingHash: string | null,
  ): Promise<string | null | undefined> {
    if (visibility !== CourseVisibility.PASSWORD) {
      return existingHash ? null : undefined;
    }

    if (provided) {
      return bcrypt.hash(provided, BCRYPT_ROUNDS);
    }

    if (existingHash) {
      return undefined;
    }

    throw new BadRequestException('Define una contraseña para el curso');
  }

  private async assertSlugFree(slug: string | undefined, courseId: number) {
    if (!slug) {
      return;
    }

    const owner = await this.repository.slugOwner(slug);

    if (owner !== null && owner !== courseId) {
      throw new ConflictException('Esa dirección ya la usa otro curso');
    }
  }

  private async checkPrerequisites(
    ids: number[] | undefined,
    courseId: number,
  ): Promise<number[] | undefined> {
    if (!ids) {
      return undefined;
    }

    const unique = [...new Set(ids)];

    if (unique.includes(courseId)) {
      throw new BadRequestException(
        'Un curso no puede ser prerrequisito de sí mismo',
      );
    }

    if (unique.length > 0 && (await this.repository.countByIds(unique)) !== unique.length) {
      throw new BadRequestException('Alguno de los prerrequisitos no existe');
    }

    return unique;
  }

  private async assertCategoryExists(categoryId?: number | null) {
    // undefined = no cambia; null = quitar la categoría.
    if (categoryId === undefined || categoryId === null) {
      return;
    }

    if (!(await this.categories.exists(categoryId))) {
      throw new BadRequestException('La categoría no existe');
    }
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || 'curso';
    let slug = base;
    let suffix = 1;

    while (await this.repository.slugExists(slug)) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }

    return slug;
  }
}
