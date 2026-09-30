import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { CourseStatus, Role } from '../../generated/prisma/enums.js';
import { slugify } from '../../common/utils/slugify.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessService } from './course-access.service.js';
import {
  CreateCourseDto,
  ListCoursesQueryDto,
  UpdateCourseDto,
} from './dto/course.dto.js';

const teacherSelect = { id: true, firstName: true, lastName: true } as const;

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CourseAccessService,
  ) {}

  async listPublished(query: ListCoursesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;

    const where = {
      status: CourseStatus.PUBLISHED,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.level ? { level: query.level } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' as const } },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        include: { category: true, teacher: { select: teacherSelect } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.course.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findPublished(id: number) {
    const course = await this.prisma.course.findFirst({
      where: { id, status: CourseStatus.PUBLISHED },
      include: {
        category: true,
        teacher: { select: teacherSelect },
        modules: {
          orderBy: { position: 'asc' },
          include: {
            lessons: {
              orderBy: { position: 'asc' },
              select: { id: true, title: true, position: true },
            },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('El curso no existe');
    }

    return course;
  }

  listManaged(user: AuthenticatedUser) {
    return this.prisma.course.findMany({
      where: user.role === Role.ADMIN ? {} : { teacherId: user.id },
      include: { category: true, teacher: { select: teacherSelect } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findManaged(user: AuthenticatedUser, id: number) {
    await this.access.assertCanManage(user, id);

    return this.prisma.course.findUniqueOrThrow({
      where: { id },
      include: {
        category: true,
        teacher: { select: teacherSelect },
        modules: {
          orderBy: { position: 'asc' },
          include: { lessons: { orderBy: { position: 'asc' } } },
        },
      },
    });
  }

  async create(user: AuthenticatedUser, dto: CreateCourseDto) {
    await this.assertCategoryExists(dto.categoryId);

    return this.prisma.course.create({
      data: {
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        price: dto.price,
        level: dto.level,
        categoryId: dto.categoryId,
        slug: await this.uniqueSlug(dto.title),
        teacherId: user.id,
      },
    });
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateCourseDto) {
    await this.access.assertCanManage(user, id);
    await this.assertCategoryExists(dto.categoryId);

    return this.prisma.course.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        price: dto.price,
        level: dto.level,
        categoryId: dto.categoryId,
      },
    });
  }

  async updateStatus(
    user: AuthenticatedUser,
    id: number,
    status: CourseStatus,
  ) {
    await this.access.assertCanManage(user, id);

    if (status === CourseStatus.PUBLISHED) {
      const modules = await this.prisma.courseModule.count({
        where: { courseId: id },
      });

      if (modules === 0) {
        throw new BadRequestException(
          'El curso necesita al menos un módulo para publicarse',
        );
      }
    }

    return this.prisma.course.update({ where: { id }, data: { status } });
  }

  async remove(user: AuthenticatedUser, id: number) {
    await this.access.assertCanManage(user, id);

    const enrollments = await this.prisma.enrollment.count({
      where: { courseId: id },
    });

    if (enrollments > 0) {
      throw new ConflictException(
        'El curso tiene estudiantes inscritos; archívalo en lugar de eliminarlo',
      );
    }

    await this.prisma.course.delete({ where: { id } });

    return { deleted: true };
  }

  private async assertCategoryExists(categoryId?: number) {
    if (categoryId === undefined) {
      return;
    }

    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException('La categoría no existe');
    }
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || 'curso';
    let slug = base;
    let suffix = 1;

    while (
      await this.prisma.course.findUnique({
        where: { slug },
        select: { id: true },
      })
    ) {
      suffix += 1;
      slug = `${base}-${suffix}`;
    }

    return slug;
  }
}
