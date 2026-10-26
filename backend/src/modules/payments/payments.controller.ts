import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CheckoutDto } from './dto/checkout.dto.js';
import { PaymentsService } from './payments.service.js';

/** Compra de cursos (pasarela simulada). */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * Paga un curso con tarjeta (simulado) y, si se aprueba, inscribe a la persona. Responde
   * `status: APPROVED | DECLINED`; los errores del formulario (tarjeta inválida o vencida) son `400`.
   */
  @Post('courses/:courseId/checkout')
  @Roles(Role.STUDENT)
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() dto: CheckoutDto,
  ) {
    return this.payments.checkout(user, courseId, dto);
  }

  /** Mis comprobantes (aprobados y rechazados). */
  @Get('payments/mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.payments.mine(user);
  }
}
