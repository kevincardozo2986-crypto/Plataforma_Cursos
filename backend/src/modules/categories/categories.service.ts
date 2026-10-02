import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { slugify } from '../../common/utils/slugify.js';
import { CategoriesRepository } from './categories.repository.js';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly repository: CategoriesRepository) {}

  list() {
    return this.repository.list();
  }

  async findOne(id: number) {
    const category = await this.repository.findById(id);

    if (!category) {
      throw new NotFoundException('La categoría no existe');
    }

    return category;
  }

  /** Para otros módulos (p. ej. courses) sin exponer la tabla. */
  exists(id: number): Promise<boolean> {
    return this.repository.exists(id);
  }

  async create(dto: CreateCategoryDto) {
    await this.assertNameFree(dto.name);

    return this.repository.create({
      name: dto.name,
      description: dto.description,
      slug: slugify(dto.name),
    });
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.findOne(id);

    if (dto.name) {
      await this.assertNameFree(dto.name, id);
    }

    return this.repository.update(id, {
      name: dto.name,
      description: dto.description,
      ...(dto.name ? { slug: slugify(dto.name) } : {}),
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    // Los cursos de la categoría quedan sin categoría (onDelete: SetNull).
    await this.repository.delete(id);

    return { deleted: true };
  }

  private async assertNameFree(name: string, exceptId?: number) {
    const clash = await this.repository.findClash(
      name,
      slugify(name),
      exceptId,
    );

    if (clash) {
      throw new ConflictException('Ya existe una categoría con ese nombre');
    }
  }
}
