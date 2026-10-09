import { Type } from 'class-transformer';
import {
  IsBoolean,
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

export class CreateAnnouncementDto {
  @Trim()
  @IsString()
  @MinLength(2, { message: 'El título debe tener mínimo 2 caracteres' })
  @MaxLength(150)
  title: string;

  /** Contenido del anuncio. Acepta HTML; se limpia al guardar. */
  @SanitizeHtml()
  @IsString()
  @MaxLength(20000)
  body: string;

  /** `false` para publicar sin avisar a los inscritos. Por defecto `true`. */
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(20000)
  body?: string;
}

export class ListAnnouncementsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;

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
