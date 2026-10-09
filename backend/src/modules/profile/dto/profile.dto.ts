import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Trim } from '../../../common/dto/trim.js';
import {
  ColorFilter,
  FontSize,
  ThemePreference,
} from '../../../generated/prisma/enums.js';

/** Un texto vacío ("") se trata como "borrar el dato": llega como null. */
const EmptyToNull = () =>
  Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );

/** Una imagen ya subida a la plataforma: /api/uploads/<32 hex>.<extensión de imagen>. */
export const SIGNATURE_PATTERN =
  /^\/api\/uploads\/[a-f0-9]{32}\.(?:png|jpe?g|webp|gif)$/;

const URL_OPTIONS = {
  protocols: ['http', 'https'],
  require_protocol: true,
};

const URL_MESSAGE = 'Debe ser una dirección web válida que empiece con http:// o https://';

/**
 * Edición del perfil y de los ajustes. Todo es opcional; en los campos que se pueden borrar,
 * `null` (o un texto vacío) los quita.
 */
export class UpdateProfileDto {
  // --- Cuenta ---

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener mínimo 2 caracteres' })
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2, { message: 'El apellido debe tener mínimo 2 caracteres' })
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @EmptyToNull()
  @Trim()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @EmptyToNull()
  @Trim()
  @IsString()
  @MaxLength(100)
  occupation?: string | null;

  /** Zona horaria IANA, por ejemplo `America/Bogota`. */
  @IsOptional()
  @IsTimeZone({ message: 'La zona horaria no es válida (por ejemplo America/Bogota)' })
  timezone?: string;

  /** Nombre con el que se muestra al docente en los cursos. */
  @IsOptional()
  @EmptyToNull()
  @Trim()
  @IsString()
  @MaxLength(100)
  publicName?: string | null;

  /** Biografía, en texto plano. */
  @IsOptional()
  @EmptyToNull()
  @Trim()
  @IsString()
  @MaxLength(2000)
  bio?: string | null;

  /**
   * Firma del docente para los certificados: una imagen subida con `POST /uploads/images`
   * (se recomienda 700×430 px con fondo transparente). `null` la quita. Solo docentes.
   */
  @IsOptional()
  @EmptyToNull()
  @Matches(SIGNATURE_PATTERN, {
    message: 'La firma debe ser una imagen subida con POST /uploads/images',
  })
  signatureUrl?: string | null;

  // --- Redes sociales ---

  @IsOptional()
  @EmptyToNull()
  @Trim()
  @IsUrl(URL_OPTIONS, { message: URL_MESSAGE })
  @MaxLength(300)
  facebookUrl?: string | null;

  @IsOptional()
  @EmptyToNull()
  @Trim()
  @IsUrl(URL_OPTIONS, { message: URL_MESSAGE })
  @MaxLength(300)
  xUrl?: string | null;

  @IsOptional()
  @EmptyToNull()
  @Trim()
  @IsUrl(URL_OPTIONS, { message: URL_MESSAGE })
  @MaxLength(300)
  linkedinUrl?: string | null;

  @IsOptional()
  @EmptyToNull()
  @Trim()
  @IsUrl(URL_OPTIONS, { message: URL_MESSAGE })
  @MaxLength(300)
  githubUrl?: string | null;

  @IsOptional()
  @EmptyToNull()
  @Trim()
  @IsUrl(URL_OPTIONS, { message: URL_MESSAGE })
  @MaxLength(300)
  websiteUrl?: string | null;

  // --- Preferencias (las tiene cualquier usuario) ---

  /** Pasar solo a la siguiente lección al terminar la actual. */
  @IsOptional()
  @IsBoolean()
  autoplayNext?: boolean;

  @IsOptional()
  @IsBoolean()
  reduceMotion?: boolean;

  @IsOptional()
  @IsEnum(ThemePreference, { message: 'El tema debe ser LIGHT, DARK o SYSTEM' })
  theme?: ThemePreference;

  @IsOptional()
  @IsEnum(FontSize, { message: 'El tamaño de letra debe ser SMALL, MEDIUM o LARGE' })
  fontSize?: FontSize;

  @IsOptional()
  @IsBoolean()
  highContrast?: boolean;

  @IsOptional()
  @IsEnum(ColorFilter, {
    message: 'El filtro de color debe ser NONE, PROTANOPIA, DEUTERANOPIA, TRITANOPIA o GRAYSCALE',
  })
  colorFilter?: ColorFilter;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Escribe tu contraseña actual' })
  @MaxLength(72)
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener mínimo 8 caracteres' })
  @MaxLength(72, { message: 'La contraseña debe tener máximo 72 caracteres' })
  newPassword: string;
}
