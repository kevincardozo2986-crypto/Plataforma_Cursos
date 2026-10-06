import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { IsMediaUrl } from '../../../common/dto/is-media-url.js';
import { SanitizeHtml } from '../../../common/dto/sanitize-html.js';
import { Trim } from '../../../common/dto/trim.js';

export class CreateLessonDto {
  @Trim()
  @IsString()
  @MinLength(2, { message: 'El título debe tener mínimo 2 caracteres' })
  @MaxLength(150)
  title: string;

  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(100000)
  content?: string;

  @IsOptional()
  @IsMediaUrl('El video debe ser una URL válida o un archivo subido')
  videoUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  position?: number;
}

export class UpdateLessonDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(100000)
  content?: string;

  @IsOptional()
  @IsMediaUrl('El video debe ser una URL válida o un archivo subido')
  videoUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  position?: number;
}
