import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { Trim } from '../../../common/dto/trim.js';

/** Texto plano (sin HTML): lo escriben también los estudiantes. */
const BODY_MESSAGE = 'El mensaje no puede estar vacío';

export class CreateQuestionDto {
  @Trim()
  @IsString()
  @MinLength(5, { message: 'El título de la pregunta debe tener mínimo 5 caracteres' })
  @MaxLength(150)
  title: string;

  @Trim()
  @IsString()
  @MinLength(1, { message: BODY_MESSAGE })
  @MaxLength(5000)
  body: string;

  /** Opcional: la lección a la que se refiere la pregunta (debe ser del mismo curso). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lessonId?: number;
}

export class CreateCommentDto {
  @Trim()
  @IsString()
  @MinLength(1, { message: BODY_MESSAGE })
  @MaxLength(5000)
  body: string;
}

export class CreateReplyDto {
  @Trim()
  @IsString()
  @MinLength(1, { message: BODY_MESSAGE })
  @MaxLength(5000)
  body: string;
}

export class UpdatePostDto {
  /** Solo las preguntas tienen título. */
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(5)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1, { message: BODY_MESSAGE })
  @MaxLength(5000)
  body?: string;
}

export const DISCUSSION_KINDS = ['QUESTION', 'COMMENT'] as const;

export class ListDiscussionsQueryDto {
  @IsOptional()
  @IsIn(DISCUSSION_KINDS, {
    message: `El tipo debe ser uno de: ${DISCUSSION_KINDS.join(', ')}`,
  })
  kind?: (typeof DISCUSSION_KINDS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lessonId?: number;

  /** Solo preguntas: `false` trae las que el docente aún no ha respondido. */
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'answered debe ser true o false' })
  answered?: boolean;

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
