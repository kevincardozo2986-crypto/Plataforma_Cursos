import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { Trim } from '../../../common/dto/trim.js';

export class OptionDto {
  @Trim()
  @IsString()
  @MinLength(1, { message: 'El texto de la opción es obligatorio' })
  @MaxLength(300)
  text: string;

  @IsBoolean()
  isCorrect: boolean;
}

export const QUESTION_TYPES = [
  'TRUE_FALSE',
  'SINGLE',
  'MULTIPLE',
  'FILL_BLANK',
  'ESSAY',
] as const;

/**
 * Según `type`, la pregunta usa unos campos u otros (el servicio valida el conjunto):
 * - SINGLE (por defecto) y MULTIPLE: `options` con `isCorrect`.
 * - TRUE_FALSE: solo `isTrue`; las opciones Verdadero/Falso las crea el servidor.
 * - FILL_BLANK: `acceptedAnswers`, las respuestas que se dan por buenas.
 * - ESSAY: pregunta abierta, sin opciones; `points` es el máximo que podrá dar el docente.
 */
export class QuestionDto {
  @Trim()
  @IsString()
  @MinLength(3, { message: 'La pregunta debe tener mínimo 3 caracteres' })
  text: string;

  @IsOptional()
  @IsIn(QUESTION_TYPES, {
    message: `El tipo de pregunta debe ser uno de: ${QUESTION_TYPES.join(', ')}`,
  })
  type?: (typeof QUESTION_TYPES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  points?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options?: OptionDto[];

  @IsOptional()
  @IsBoolean()
  isTrue?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Trim()
  @IsString({ each: true })
  @MinLength(1, { each: true, message: 'Una respuesta aceptada no puede estar vacía' })
  @MaxLength(300, { each: true })
  acceptedAnswers?: string[];
}

export class CreateEvaluationDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'La evaluación necesita al menos 1 pregunta' })
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions: QuestionDto[];
}

export class UpdateEvaluationDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number;

  /** Si se envía, reemplaza todas las preguntas de la evaluación. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions?: QuestionDto[];
}

/**
 * Respuesta a una pregunta:
 * - TRUE_FALSE / SINGLE / MULTIPLE: `optionIds` (`optionId` se acepta como atajo de una sola).
 * - FILL_BLANK y ESSAY: `text`.
 */
export class AnswerDto {
  @Type(() => Number)
  @IsInt()
  questionId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  optionId?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  optionIds?: number[];

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(5000, { message: 'La respuesta puede tener máximo 5000 caracteres' })
  text?: string;
}

export class GradeDto {
  @Type(() => Number)
  @IsInt()
  questionId: number;

  /** Entero entre 0 y los puntos de la pregunta. */
  @Type(() => Number)
  @IsInt({ message: 'Los puntos deben ser un número entero' })
  @Min(0)
  points: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

/** Calificación del docente a las preguntas abiertas de un intento. */
export class GradeAttemptDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Envía al menos una calificación' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GradeDto)
  grades: GradeDto[];

  /** Comentario general para el estudiante. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  feedback?: string;
}

export const ATTEMPT_STATUSES = ['GRADED', 'PENDING_REVIEW'] as const;

export class ListAttemptsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  evaluationId?: number;

  @IsOptional()
  @IsIn(ATTEMPT_STATUSES, {
    message: `El estado debe ser uno de: ${ATTEMPT_STATUSES.join(', ')}`,
  })
  status?: (typeof ATTEMPT_STATUSES)[number];

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

export class SubmitAttemptDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}
