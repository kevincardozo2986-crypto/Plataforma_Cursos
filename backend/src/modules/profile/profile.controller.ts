import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ChangePasswordDto, UpdateProfileDto } from './dto/profile.dto.js';
import { ProfileService } from './profile.service.js';

@Controller()
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  /** Mi cuenta, perfil, preferencias y estadísticas (docentes). */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.get(user);
  }

  /** Edita lo que se envíe y devuelve el perfil actualizado. */
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profile.update(user, dto);
  }

  @Patch('profile/password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.profile.changePassword(user, dto);
  }

  /** Perfil público de un docente (sin sesión). */
  @Get('teachers/:id')
  publicTeacher(@Param('id', ParseIntPipe) id: number) {
    return this.profile.publicTeacher(id);
  }
}
