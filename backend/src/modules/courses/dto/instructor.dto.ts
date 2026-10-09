import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class AddInstructorDto {
  /** Correo de la cuenta del docente que se quiere agregar. */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  email: string;
}
