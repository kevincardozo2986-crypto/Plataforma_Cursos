import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { SanitizeHtml } from '../../../common/dto/sanitize-html.js';
import { Trim } from '../../../common/dto/trim.js';

/**
 * Ajustes de liberación gradual de un módulo. Cada uno solo se usa si el curso está en el
 * modo correspondiente (`dripType`): `unlockAt` en BY_DATE, `unlockAfterDays` en AFTER_DAYS y
 * `requiresModuleIds` en PREREQUISITES. SEQUENTIAL no necesita ajustes (sigue el orden).
 */
export class CreateCourseModuleDto {
  @Trim()
  @IsString()
  @MinLength(2, { message: 'El título debe tener mínimo 2 caracteres' })
  @MaxLength(150)
  title: string;

  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  position?: number;

  /** Fecha y hora en que se abre el módulo (ISO 8601). */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de apertura debe ser una fecha válida (ISO 8601)' })
  unlockAt?: string;

  /** Días después de la inscripción en que se abre. 0 = de inmediato. */
  @IsOptional()
  @IsInt({ message: 'Los días deben ser un número entero' })
  @Min(0)
  @Max(3650)
  unlockAfterDays?: number;

  /** Módulos del mismo curso que hay que terminar antes de este. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  requiresModuleIds?: number[];
}

export class UpdateCourseModuleDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  position?: number;

  /** `null` quita la fecha. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de apertura debe ser una fecha válida (ISO 8601)' })
  unlockAt?: string | null;

  /** `null` quita el retraso. */
  @IsOptional()
  @IsInt({ message: 'Los días deben ser un número entero' })
  @Min(0)
  @Max(3650)
  unlockAfterDays?: number | null;

  /** Reemplaza la lista completa; `[]` la vacía. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  requiresModuleIds?: number[];
}
