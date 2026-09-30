import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { slugify } from '../../common/utils/slugify.js';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { courses: { where: { status: 'PUBLISHED' } } } },
      },
    });
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({ where: { id } });

    if (!category) {
      throw new NotFoundException('La categoría no existe');
    }

    return category;
  }

  async create(dto: CreateCategoryDto) {
    await this.assertNameFree(dto.name);

    return this.prisma.category.create({
      data: {
        name: dto.name,
        description: dto.description,
        slug: slugify(dto.name),
      },
    });
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.findOne(id);

    if (dto.name) {
      await this.assertNameFree(dto.name, id);
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        ...(dto.name ? { slug: slugify(dto.name) } : {}),
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    // Los cursos de la categoría quedan sin categoría (onDelete: SetNull).
    await this.prisma.category.delete({ where: { id } });

    return { deleted: true };
  }

  private async assertNameFree(name: string, exceptId?: number) {
    const slug = slugify(name);

    const clash = await this.prisma.category.findFirst({
      where: {
        OR: [{ name }, { slug }],
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });

    if (clash) {
      throw new ConflictException('Ya existe una categoría con ese nombre');
    }
  }
}
