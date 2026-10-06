import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { SanitizeHtml } from '../../../common/dto/sanitize-html.js';
import { Trim } from '../../../common/dto/trim.js';
import { PRIVATE_NAME } from '../../uploads/upload-paths.js';

export class CreateAssignmentDto {
  @Trim()
  @IsString()
  @MinLength(2, { message: 'El título debe tener mínimo 2 caracteres' })
  @MaxLength(150)
  title: string;

  /** Instrucciones. Acepta HTML; se limpia al guardar. */
  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(20000)
  description?: string;

  /** Fecha y hora límite en formato ISO, por ejemplo `2026-11-30T23:59:00-05:00`. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha límite debe ser una fecha válida (ISO 8601)' })
  dueAt?: string;

  /** `false`: pasada la fecha límite ya no se aceptan entregas. Por defecto `true`. */
  @IsOptional()
  @IsBoolean()
  allowLate?: boolean;

  /** Puntaje máximo. Por defecto 100. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxScore?: number;
}

export class UpdateAssignmentDto {
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
  description?: string;

  /** `null` quita la fecha límite. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha límite debe ser una fecha válida (ISO 8601)' })
  dueAt?: string | null;

  @IsOptional()
  @IsBoolean()
  allowLate?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxScore?: number;
}

export class FileRefDto {
  /** Nombre que devolvió `POST /uploads/documents`. */
  @Matches(PRIVATE_NAME, { message: 'El nombre del archivo no es válido' })
  name: string;
}

/** Entrega del estudiante: un texto, archivos, o ambos (al menos uno). */
export class SubmitAssignmentDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(20000)
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: 'Puedes adjuntar hasta 10 archivos' })
  @ValidateNested({ each: true })
  @Type(() => FileRefDto)
  files?: FileRefDto[];
}

export class GradeSubmissionDto {
  /** Entero entre 0 y el puntaje máximo de la tarea. */
  @Type(() => Number)
  @IsInt({ message: 'La nota debe ser un número entero' })
  @Min(0)
  score: number;

  /** Comentario para el estudiante. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(5000)
  feedback?: string;
}

export const SUBMISSION_STATUSES = ['SUBMITTED', 'GRADED'] as const;

export class ListSubmissionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assignmentId?: number;

  @IsOptional()
  @IsIn(SUBMISSION_STATUSES, {
    message: `El estado debe ser uno de: ${SUBMISSION_STATUSES.join(', ')}`,
  })
  status?: (typeof SUBMISSION_STATUSES)[number];

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
