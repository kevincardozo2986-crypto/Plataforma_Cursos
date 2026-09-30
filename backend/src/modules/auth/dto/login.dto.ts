import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El correo o documento es obligatorio' })
  identifier: string;

  @IsString()
  @MinLength(8, {
    message: 'La contraseña debe tener mínimo 8 caracteres',
  })
  password: string;
}
