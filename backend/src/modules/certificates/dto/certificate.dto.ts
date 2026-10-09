import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { Trim } from '../../../common/dto/trim.js';

export const LAYOUTS = ['CLASSIC', 'MODERN'] as const;
export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/**
 * Plantilla de certificado. En `body` se pueden usar los marcadores `{{student}}`, `{{course}}`,
 * `{{date}}`, `{{hours}}` y `{{instructor}}`. Si no se envían `title`, `body`, `accentColor` o
 * `layout`, se usan los valores por defecto.
 */
export class CreateCertificateTemplateDto {
  /** Nombre interno, para reconocerla en la lista. */
  @Trim()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener mínimo 2 caracteres' })
  @MaxLength(100)
  name: string;

  /** Encabezado del certificado. */
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(10, { message: 'El texto del certificado debe tener mínimo 10 caracteres' })
  @MaxLength(600)
  body?: string;

  /** Color principal en hexadecimal, por ejemplo `#1F3A8A`. */
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'El color debe ser hexadecimal, por ejemplo #1F3A8A' })
  accentColor?: string;

  @IsOptional()
  @IsEnum(LAYOUTS, { message: `El diseño debe ser uno de: ${LAYOUTS.join(', ')}` })
  layout?: (typeof LAYOUTS)[number];
}

export class UpdateCertificateTemplateDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(10, { message: 'El texto del certificado debe tener mínimo 10 caracteres' })
  @MaxLength(600)
  body?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'El color debe ser hexadecimal, por ejemplo #1F3A8A' })
  accentColor?: string;

  @IsOptional()
  @IsEnum(LAYOUTS, { message: `El diseño debe ser uno de: ${LAYOUTS.join(', ')}` })
  layout?: (typeof LAYOUTS)[number];
}

export const CERTIFICATE_STATUSES = ['VALID', 'REVOKED'] as const;

export class ListCertificatesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;

  @IsOptional()
  @IsIn(CERTIFICATE_STATUSES, {
    message: `El estado debe ser uno de: ${CERTIFICATE_STATUSES.join(', ')}`,
  })
  status?: (typeof CERTIFICATE_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
