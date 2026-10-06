import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import {
  CreateEvaluationDto,
  GradeAttemptDto,
  ListAttemptsQueryDto,
  SubmitAttemptDto,
  UpdateEvaluationDto,
} from './dto/evaluation.dto.js';
import { EvaluationsService } from './evaluations.service.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Get('modules/:moduleId/evaluations')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleId', ParseIntPipe) moduleId: number,
  ) {
    return this.evaluations.listByModule(user, moduleId);
  }

  @Post('modules/:moduleId/evaluations')
  @Roles(Role.TEACHER, Role.ADMIN)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleId', ParseIntPipe) moduleId: number,
    @Body() dto: CreateEvaluationDto,
  ) {
    return this.evaluations.create(user, moduleId, dto);
  }

  @Get('evaluations/:id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.evaluations.findOne(user, id);
  }

  @Patch('evaluations/:id')
  @Roles(Role.TEACHER, Role.ADMIN)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEvaluationDto,
  ) {
    return this.evaluations.update(user, id, dto);
  }

  @Delete('evaluations/:id')
  @Roles(Role.TEACHER, Role.ADMIN)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.evaluations.remove(user, id);
  }

  @Post('evaluations/:id/attempts')
  @Roles(Role.STUDENT)
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.evaluations.submitAttempt(user, id, dto);
  }

  @Get('evaluations/:id/attempts/mine')
  myAttempts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.evaluations.myAttempts(user, id);
  }

  /** Bandeja del docente. Filtros: courseId, evaluationId, status, limit, offset. */
  @Get('evaluation-attempts')
  @Roles(Role.TEACHER, Role.ADMIN)
  listAttempts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAttemptsQueryDto,
  ) {
    return this.evaluations.listAttempts(user, query);
  }

  @Get('evaluation-attempts/:id')
  @Roles(Role.TEACHER, Role.ADMIN)
  getAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.evaluations.getAttempt(user, id);
  }

  @Patch('evaluation-attempts/:id/grade')
  @Roles(Role.TEACHER, Role.ADMIN)
  gradeAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GradeAttemptDto,
  ) {
    return this.evaluations.gradeAttempt(user, id, dto);
  }
}
