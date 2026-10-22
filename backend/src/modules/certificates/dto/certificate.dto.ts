import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { Trim } from '../../../common/dto/trim.js';

import { CERTIFICATE_LAYOUTS } from '../certificate-pdf.js';
import { OFFSET_MAX_X, OFFSET_MAX_Y, SIZE_MAX, SIZE_MIN, VEIL_MAX } from '../certificate-style.js';

export const LAYOUTS = CERTIFICATE_LAYOUTS;
/** Claves de tipografía: letras, números, guiones y «custom:12». Que exista se comprueba en el servicio. */
export const FONT_KEY = /^[A-Za-z0-9:_-]{1,40}$/;
/** Estilo de un texto: negrita, cursiva, tamaño (%) y color. Todo es opcional; null o nada = el valor por defecto. */
export class TextStyleDto {
  @IsOptional()
  @IsBoolean()
  bold?: boolean | null;

  @IsOptional()
  @IsBoolean()
  italic?: boolean;

  @IsOptional()
  @IsInt({ message: 'El tamaño debe ser un número entero (porcentaje)' })
  @Min(SIZE_MIN, { message: `El tamaño mínimo es ${SIZE_MIN}%` })
  @Max(SIZE_MAX, { message: `El tamaño máximo es ${SIZE_MAX}%` })
  size?: number;

  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'El color debe ser hexadecimal, por ejemplo #1F3A8A' })
  color?: string | null;
}

/** Cuánto se corrió un bloque de texto, en puntos de página. */
export class OffsetDto {
  @IsOptional()
  @IsInt({ message: 'El desplazamiento horizontal debe ser un número entero' })
  @Min(-OFFSET_MAX_X)
  @Max(OFFSET_MAX_X, { message: `El desplazamiento horizontal máximo es ${OFFSET_MAX_X}` })
  x?: number;

  @IsOptional()
  @IsInt({ message: 'El desplazamiento vertical debe ser un número entero' })
  @Min(-OFFSET_MAX_Y)
  @Max(OFFSET_MAX_Y, { message: `El desplazamiento vertical máximo es ${OFFSET_MAX_Y}` })
  y?: number;
}

/** Posición de cada bloque de texto: el título, el destinatario (nombre y cédula), el texto y la firma. */
export class OffsetsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => OffsetDto)
  title?: OffsetDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OffsetDto)
  recipient?: OffsetDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OffsetDto)
  body?: OffsetDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OffsetDto)
  signature?: OffsetDto;
}

export class CertificateStyleDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => TextStyleDto)
  title?: TextStyleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TextStyleDto)
  name?: TextStyleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TextStyleDto)
  body?: TextStyleDto;

  /** Mostrar la cédula bajo el nombre (por defecto sí). */
  @IsOptional()
  @IsBoolean()
  showDocument?: boolean;

  /** Velo blanco detrás del texto, en porcentaje (0–80). */
  @IsOptional()
  @IsInt({ message: 'El velo debe ser un número entero (porcentaje)' })
  @Min(0)
  @Max(VEIL_MAX, { message: `El velo máximo es ${VEIL_MAX}%` })
  veil?: number;

  /** Dónde está cada bloque de texto respecto a su sitio original (en puntos de página). */
  @IsOptional()
  @ValidateNested()
  @Type(() => OffsetsDto)
  offsets?: OffsetsDto;
}

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Una imagen ya subida a la plataforma: /api/uploads/<32 hex>.<extensión de imagen>. */
export const UPLOADED_IMAGE = /^\/api\/uploads\/[a-f0-9]{32}\.(?:png|jpe?g|webp|gif)$/;
const UPLOADED_IMAGE_MESSAGE = 'La imagen de fondo debe ser una imagen subida con POST /uploads/images';

/**
 * Plantilla de certificado. En `body` se pueden usar los marcadores `{{student}}`, `{{course}}`,
 * `{{date}}`, `{{hours}}` y `{{instructor}}`. Si no se envían `title`, `body`, `accentColor` o
 * `layout`, se usan los valores por defecto.
 */
export class CreateCertificateTemplateDto {
  /** Nombre interno, para reconocerla en la lista. */
  @Trim()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener mínimo 2 caracteres' })
  @MaxLength(100)
  name: string;

  /** Encabezado del certificado. */
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(10, { message: 'El texto del certificado debe tener mínimo 10 caracteres' })
  @MaxLength(600)
  body?: string;

  /** Color principal en hexadecimal, por ejemplo `#1F3A8A`. */
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'El color debe ser hexadecimal, por ejemplo #1F3A8A' })
  accentColor?: string;

  @IsOptional()
  @IsEnum(LAYOUTS, { message: `El diseño debe ser uno de: ${LAYOUTS.join(', ')}` })
  layout?: (typeof LAYOUTS)[number];

  /** Tipografía de título y nombre: "SANS", "SERIF", una de `GET /certificate-fonts` o "custom:<id>". */
  @IsOptional()
  @Matches(FONT_KEY, { message: 'La tipografía no es válida' })
  font?: string;

  /** Tipografía del texto (mismos valores). */
  @IsOptional()
  @Matches(FONT_KEY, { message: 'La tipografía del texto no es válida' })
  bodyFont?: string;

  /**
   * Imagen de fondo propia (diseño `IMAGE`): una imagen subida con `POST /uploads/images`,
   * idealmente apaisada (A4, 297 × 210 mm). `null` la quita.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value))
  @Matches(UPLOADED_IMAGE, { message: UPLOADED_IMAGE_MESSAGE })
  backgroundUrl?: string | null;

  /** Negrita, cursiva, tamaño y color de cada texto. Reemplaza el estilo anterior completo. */
  @IsOptional()
  @ValidateNested()
  @Type(() => CertificateStyleDto)
  style?: CertificateStyleDto;
}

export class UpdateCertificateTemplateDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(10, { message: 'El texto del certificado debe tener mínimo 10 caracteres' })
  @MaxLength(600)
  body?: string;

  @IsOptional()
  @Matches(HEX_COLOR, { message: 'El color debe ser hexadecimal, por ejemplo #1F3A8A' })
  accentColor?: string;

  @IsOptional()
  @IsEnum(LAYOUTS, { message: `El diseño debe ser uno de: ${LAYOUTS.join(', ')}` })
  layout?: (typeof LAYOUTS)[number];

  /** Tipografía de título y nombre: "SANS", "SERIF", una de `GET /certificate-fonts` o "custom:<id>". */
  @IsOptional()
  @Matches(FONT_KEY, { message: 'La tipografía no es válida' })
  font?: string;

  /** Tipografía del texto (mismos valores). */
  @IsOptional()
  @Matches(FONT_KEY, { message: 'La tipografía del texto no es válida' })
  bodyFont?: string;

  /** Negrita, cursiva, tamaño y color de cada texto. Reemplaza el estilo anterior completo. */
  /**
   * Imagen de fondo propia (diseño `IMAGE`): una imagen subida con `POST /uploads/images`,
   * idealmente apaisada (A4, 297 × 210 mm). `null` la quita.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value))
  @Matches(UPLOADED_IMAGE, { message: UPLOADED_IMAGE_MESSAGE })
  backgroundUrl?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => CertificateStyleDto)
  style?: CertificateStyleDto;
}

export const CERTIFICATE_STATUSES = ['VALID', 'REVOKED'] as const;

export class ListCertificatesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;

  @IsOptional()
  @IsIn(CERTIFICATE_STATUSES, {
    message: `El estado debe ser uno de: ${CERTIFICATE_STATUSES.join(', ')}`,
  })
  status?: (typeof CERTIFICATE_STATUSES)[number];

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

/** Corrección de un certificado ya emitido (por ejemplo, un error de digitación en el nombre). */
export class UpdateIssuedCertificateDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener mínimo 2 caracteres' })
  @MaxLength(120)
  studentName?: string;

  /** Documento de identidad. Vacío o `null` lo quita del certificado. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value))
  @Trim()
  @IsString()
  @MinLength(4, { message: 'El documento debe tener mínimo 4 caracteres' })
  @MaxLength(30)
  studentDocument?: string | null;
}
