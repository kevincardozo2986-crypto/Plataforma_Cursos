import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
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

  @IsUrl({}, { message: 'El recurso debe ser una URL válida' })
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
  @IsUrl({}, { message: 'El recurso debe ser una URL válida' })
  url?: string;
}
