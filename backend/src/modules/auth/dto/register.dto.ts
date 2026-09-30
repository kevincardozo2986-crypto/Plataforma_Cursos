import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, {
    message: 'El nombre debe tener mínimo 2 caracteres',
  })
  @MaxLength(50, {
    message: 'El nombre debe tener máximo 50 caracteres',
  })
  firstName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, {
    message: 'El apellido debe tener mínimo 2 caracteres',
  })
  @MaxLength(50, {
    message: 'El apellido debe tener máximo 50 caracteres',
  })
  lastName: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail(
    {},
    {
      message: 'El correo electrónico no es válido',
    },
  )
  email: string;

  @IsString()
  @MinLength(8, {
    message: 'La contraseña debe tener mínimo 8 caracteres',
  })
  @MaxLength(72, {
    message: 'La contraseña debe tener máximo 72 caracteres',
  })
  password: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El documento es obligatorio' })
  document: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  phone?: string;
}
