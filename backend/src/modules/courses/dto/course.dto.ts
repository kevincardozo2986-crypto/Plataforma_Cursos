import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { Trim } from '../../../common/dto/trim.js';
import {
  CourseLevel,
  CourseStatus,
} from '../../../generated/prisma/enums.js';

export class CreateCourseDto {
  @Trim()
  @IsString()
  @MinLength(3, { message: 'El título debe tener mínimo 3 caracteres' })
  @MaxLength(150)
  title: string;

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'La descripción es obligatoria' })
  description: string;

  @IsOptional()
  @IsUrl({}, { message: 'La imagen debe ser una URL válida' })
  imageUrl?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  price: number;

  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;
}

export class UpdateCourseDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @IsOptional()
  @IsUrl({}, { message: 'La imagen debe ser una URL válida' })
  imageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  price?: number;

  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;
}

export class UpdateCourseStatusDto {
  @IsEnum(CourseStatus)
  status: CourseStatus;
}

export class ListCoursesQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsEnum(CourseLevel)
  level?: CourseLevel;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
