import { IsMediaUrl } from '../../../common/dto/is-media-url.js';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Trim } from '../../../common/dto/trim.js';
import { ResourceType } from '../../../generated/prisma/enums.js';

export class CreateResourceDto {
  @Trim()
  @IsString()
  @MinLength(2, { message: 'El título debe tener mínimo 2 caracteres' })
  @MaxLength(150)
  title: string;

  @IsOptional()
  @IsEnum(ResourceType)
  type?: ResourceType;

  @IsMediaUrl('El recurso debe ser una URL http(s) o un archivo de la plataforma')
  url: string;
}

export class UpdateResourceDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsEnum(ResourceType)
  type?: ResourceType;

  @IsOptional()
  @IsMediaUrl('El recurso debe ser una URL http(s) o un archivo de la plataforma')
  url?: string;
}
