import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { IsMediaUrl } from '../../../common/dto/is-media-url.js';
import { SanitizeHtml } from '../../../common/dto/sanitize-html.js';
import { Trim } from '../../../common/dto/trim.js';
import {
  CourseLevel,
  CourseStatus,
  CourseVisibility,
  DripType,
} from '../../../generated/prisma/enums.js';

/** Dirección del curso: minúsculas, números y guiones; sin guiones al borde ni dobles. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateCourseDto {
  @Trim()
  @IsString()
  @MinLength(3, { message: 'El título debe tener mínimo 3 caracteres' })
  @MaxLength(150)
  title: string;

  @SanitizeHtml()
  @IsString()
  @IsNotEmpty({ message: 'La descripción es obligatoria' })
  @MaxLength(20000)
  description: string;

  @IsOptional()
  @IsMediaUrl('La imagen debe ser una URL válida o un archivo subido')
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

/**
 * Edición de un curso (también desde el asistente). Todo es opcional.
 * En los campos que aceptan `null`, null borra el valor.
 */
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
  @Matches(SLUG_PATTERN, {
    message:
      'La dirección solo puede tener minúsculas, números y guiones (sin guiones al principio, al final ni dobles)',
  })
  @MaxLength(120)
  slug?: string;

  /** Puede quedar vacía mientras el curso es un borrador; para publicar es obligatoria. */
  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(20000)
  description?: string;

  @IsOptional()
  @IsMediaUrl('La imagen debe ser una URL válida o un archivo subido')
  imageUrl?: string;

  @IsOptional()
  @IsMediaUrl('El video debe ser una URL válida o un archivo subido')
  introVideoUrl?: string;

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

  // --- Acceso y cupo ---

  @IsOptional()
  @IsEnum(CourseVisibility)
  visibility?: CourseVisibility;

  /** Solo se usa si la visibilidad es PASSWORD. Se guarda cifrada. */
  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'La contraseña debe tener mínimo 4 caracteres' })
  @MaxLength(100)
  accessPassword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El cupo debe ser de al menos 1 estudiante' })
  maxStudents?: number;

  @IsOptional()
  @IsBoolean()
  publicContent?: boolean;

  @IsOptional()
  @IsBoolean()
  qaEnabled?: boolean;

  /**
   * Cómo se libera el contenido a los inscritos: NONE (todo abierto), BY_DATE, AFTER_DAYS,
   * SEQUENTIAL o PREREQUISITES. Los ajustes de cada módulo se configuran en el módulo.
   */
  /**
   * Plantilla del certificado que se emite al completar el curso (una de las tuyas,
   * `GET /certificate-templates`). `null` quita el certificado del curso.
   */
  @IsOptional()
  @IsInt()
  certificateTemplateId?: number | null;

  @IsOptional()
  @IsEnum(DripType, {
    message: `La liberación del contenido debe ser una de: ${Object.values(DripType).join(', ')}`,
  })
  dripType?: DripType;

  // --- Resumen del curso ---

  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(5000)
  whatYouWillLearn?: string;

  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(5000)
  audience?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  durationMinutes?: number;

  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(5000)
  materials?: string;

  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(5000)
  requirements?: string;

  /** Cursos que se deben completar antes de inscribirse. Reemplaza la lista completa. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Type(() => Number)
  @IsInt({ each: true })
  prerequisiteIds?: number[];
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
