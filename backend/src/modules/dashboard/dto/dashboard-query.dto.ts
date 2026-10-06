import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';

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
