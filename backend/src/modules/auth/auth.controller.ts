import { RecoveryRateGuard } from './recovery-rate.guard.js';
import { PasswordResetService } from './password-reset.service.js';
import {
  RequestPasswordCodeDto,
  ConfirmRecoveryDto,
  ConfirmPasswordCodeDto,
} from './dto/password-reset.dto.js';
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';

import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('password/request-code')
  @UseGuards(JwtAuthGuard)
  requestCode(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RequestPasswordCodeDto,
  ) {
    return this.passwordReset.request(request.user!, dto.identifier);
  }
  @Post('password/confirm-code')
  @UseGuards(JwtAuthGuard)
  confirmCode(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ConfirmPasswordCodeDto,
  ) {
    return this.passwordReset.confirm(request.user!, dto.code, dto.newPassword);
  }

  @Post('recovery/request-code')
  @UseGuards(RecoveryRateGuard)
  requestRecovery(@Body() dto: RequestPasswordCodeDto) {
    return this.passwordReset.requestRecovery(dto.identifier);
  }
  @Post('recovery/confirm-code')
  @UseGuards(RecoveryRateGuard)
  confirmRecovery(@Body() dto: ConfirmRecoveryDto) {
    return this.passwordReset.confirmRecovery(
      dto.challenge,
      dto.code,
      dto.newPassword,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }
}
