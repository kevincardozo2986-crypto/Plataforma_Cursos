import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

import { Trim } from '../../../common/dto/trim.js';

/** Datos de la tarjeta del formulario de pago (simulado). El número y el código NUNCA se guardan. */
export class CheckoutDto {
  @Trim()
  @IsString()
  @MinLength(2, { message: 'Escribe el nombre que aparece en la tarjeta' })
  @MaxLength(80)
  cardHolder: string;

  /** Con o sin espacios: «4242 4242 4242 4242». */
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value))
  @Matches(/^\d{12,19}$/, { message: 'El número de la tarjeta debe tener entre 12 y 19 dígitos' })
  cardNumber: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El mes de vencimiento debe ser de 1 a 12' })
  @Max(12, { message: 'El mes de vencimiento debe ser de 1 a 12' })
  expMonth: number;

  /** Dos cifras (28) o cuatro (2028). */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2100)
  expYear: number;

  @Matches(/^\d{3,4}$/, { message: 'El código de seguridad debe tener 3 o 4 dígitos' })
  cvv: string;

  /** Solo para cursos con contraseña. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  password?: string;
}
