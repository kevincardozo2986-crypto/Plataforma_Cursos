import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { Trim } from '../../../common/dto/trim.js';
import { CourseStatus, Role, UserStatus } from '../../../generated/prisma/enums.js';

const lower = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

class PageQueryDto {
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

export class ListUsersQueryDto extends PageQueryDto {
  /** Busca en nombre, apellido, correo o documento. */
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'El rol debe ser STUDENT, TEACHER o ADMIN' })
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus, { message: 'El estado debe ser ACTIVE o INACTIVE' })
  status?: UserStatus;
}

/** Cuenta creada por un administrador (por ejemplo, un docente). */
export class CreateUserDto {
  @Trim()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener mínimo 2 caracteres' })
  @MaxLength(50)
  firstName: string;

  @Trim()
  @IsString()
  @MinLength(2, { message: 'El apellido debe tener mínimo 2 caracteres' })
  @MaxLength(50)
  lastName: string;

  @lower()
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  email: string;

  @Trim()
  @IsString()
  @MinLength(4, { message: 'El documento debe tener mínimo 4 caracteres' })
  @MaxLength(30)
  document: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsEnum(Role, { message: 'El rol debe ser STUDENT, TEACHER o ADMIN' })
  role: Role;

  /** Contraseña inicial; la persona puede cambiarla después. */
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener mínimo 8 caracteres' })
  @MaxLength(72)
  password: string;
}

/** Lo que un administrador puede cambiar de otra cuenta. */
export class UpdateUserDto {
  @IsOptional()
  @IsEnum(Role, { message: 'El rol debe ser STUDENT, TEACHER o ADMIN' })
  role?: Role;

  /** INACTIVE bloquea el acceso y cierra sus sesiones; ACTIVE lo devuelve. */
  @IsOptional()
  @IsEnum(UserStatus, { message: 'El estado debe ser ACTIVE o INACTIVE' })
  status?: UserStatus;
}

export class ListAdminCoursesQueryDto extends PageQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(Object.values(CourseStatus), { message: 'El estado debe ser DRAFT, PUBLISHED o ARCHIVED' })
  status?: CourseStatus;

  /** Solo los cursos de este docente (autor). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  teacherId?: number;
}
