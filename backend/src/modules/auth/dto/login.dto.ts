import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El correo o documento es obligatorio' })
  @MaxLength(254)
  identifier: string;

  @IsString()
  @MaxLength(72)
  @MinLength(8, {
    message: 'La contraseña debe tener mínimo 8 caracteres',
  })
  password: string;
}
