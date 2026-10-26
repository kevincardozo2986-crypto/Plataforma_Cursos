import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { PERIODS, type Period } from '../dashboard-calc.js';

export class DashboardQueryDto {
  /** Por defecto `all`. Filtra por fecha de inscripción. */
  @IsOptional()
  @IsIn(PERIODS, {
    message: `El periodo debe ser uno de: ${PERIODS.join(', ')}`,
  })
  period?: Period;

  /** Limita las métricas a un solo curso. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;
}

export const STUDENT_STATES = ['COMPLETED', 'IN_PROGRESS', 'INACTIVE', 'CANCELLED'] as const;
export type StudentState = (typeof STUDENT_STATES)[number];

/** Lista de estudiantes de los cursos del docente. */
export class StudentsQueryDto extends DashboardQueryDto {
  /** Solo los que están en ese estado. */
  @IsOptional()
  @IsIn(STUDENT_STATES, { message: `El estado debe ser uno de: ${STUDENT_STATES.join(', ')}` })
  state?: StudentState;

  /** Busca en el nombre, el apellido o el correo. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
