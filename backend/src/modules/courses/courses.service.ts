import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CourseStatus, Role } from '../../generated/prisma/enums.js';
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

    return { ...course, modules: await this.modules.outline(id, true) };
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

  async update(user: AuthenticatedUser, id: number, dto: UpdateCourseDto) {
    await this.access.assertCanManage(user, id);
    await this.assertCategoryExists(dto.categoryId);

    return this.repository.update(id, {
      title: dto.title,
      description: dto.description,
      imageUrl: dto.imageUrl,
      price: dto.price,
      level: dto.level,
      categoryId: dto.categoryId,
    });
  }

  async updateStatus(
    user: AuthenticatedUser,
    id: number,
    status: CourseStatus,
  ) {
    await this.access.assertCanManage(user, id);

    if (
      status === CourseStatus.PUBLISHED &&
      (await this.modules.countByCourse(id)) === 0
    ) {
      throw new BadRequestException(
        'El curso necesita al menos un módulo para publicarse',
      );
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

  private async assertCategoryExists(categoryId?: number) {
    if (categoryId === undefined) {
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
