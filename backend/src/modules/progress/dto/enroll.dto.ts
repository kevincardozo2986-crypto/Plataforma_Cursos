import { IsOptional, IsString, MaxLength } from 'class-validator';

export class EnrollDto {
  /** Solo para cursos protegidos con contraseña. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  password?: string;
}
