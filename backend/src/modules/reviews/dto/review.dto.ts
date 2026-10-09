import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { Trim } from '../../../common/dto/trim.js';

export class SaveReviewDto {
  /** Calificación de 1 a 5 estrellas. */
  @Type(() => Number)
  @IsInt({ message: 'La calificación debe ser un número entero de 1 a 5' })
  @Min(1, { message: 'La calificación mínima es 1' })
  @Max(5, { message: 'La calificación máxima es 5' })
  rating: number;

  /** Comentario opcional, en texto plano. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ListReviewsQueryDto {
  /** Solo las reseñas con esta calificación. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  /** Solo en la bandeja del docente: limita a un curso. */
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
