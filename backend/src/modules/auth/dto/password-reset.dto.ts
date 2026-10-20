import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../../common/dto/trim.js';
export class RequestPasswordCodeDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  identifier: string;
}
export class ConfirmPasswordCodeDto {
  @Trim()
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;
}

export class ConfirmRecoveryDto extends ConfirmPasswordCodeDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  challenge: string;
}
