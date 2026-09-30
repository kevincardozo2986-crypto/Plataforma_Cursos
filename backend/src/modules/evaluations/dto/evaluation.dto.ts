import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

export class QuestionDto {
  @Trim()
  @IsString()
  @MinLength(3, { message: 'La pregunta debe tener mínimo 3 caracteres' })
  text: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  points?: number;

  @IsArray()
  @ArrayMinSize(2, { message: 'Cada pregunta necesita al menos 2 opciones' })
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options: OptionDto[];
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

export class AnswerDto {
  @Type(() => Number)
  @IsInt()
  questionId: number;

  @Type(() => Number)
  @IsInt()
  optionId: number;
}

export class SubmitAttemptDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}
