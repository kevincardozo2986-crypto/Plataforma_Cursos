import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AssignmentsService } from './assignments.service.js';
import {
  CreateAssignmentDto,
  GradeSubmissionDto,
  ListSubmissionsQueryDto,
  SubmitAssignmentDto,
  UpdateAssignmentDto,
} from './dto/assignment.dto.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  // --- Tareas ---

  @Get('modules/:moduleId/assignments')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleId', ParseIntPipe) moduleId: number,
  ) {
    return this.assignments.listByModule(user, moduleId);
  }

  @Post('modules/:moduleId/assignments')
  @Roles(Role.TEACHER, Role.ADMIN)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('moduleId', ParseIntPipe) moduleId: number,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.assignments.create(user, moduleId, dto);
  }

  @Get('assignments/:id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.assignments.findOne(user, id);
  }

  @Patch('assignments/:id')
  @Roles(Role.TEACHER, Role.ADMIN)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignments.update(user, id, dto);
  }

  @Delete('assignments/:id')
  @Roles(Role.TEACHER, Role.ADMIN)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.assignments.remove(user, id);
  }

  // --- Entregas del estudiante ---

  /** Entrega o reenvía la tarea (mientras no esté calificada). */
  @Put('assignments/:id/submission')
  @Roles(Role.STUDENT)
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitAssignmentDto,
  ) {
    return this.assignments.submit(user, id, dto);
  }

  @Get('assignments/:id/submission/mine')
  @Roles(Role.STUDENT)
  mySubmission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.assignments.mySubmission(user, id);
  }

  // --- Revisión del docente ---

  /** Bandeja: courseId, assignmentId, status (SUBMITTED | GRADED), limit, offset. */
  @Get('assignment-submissions')
  @Roles(Role.TEACHER, Role.ADMIN)
  listSubmissions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSubmissionsQueryDto,
  ) {
    return this.assignments.listSubmissions(user, query);
  }

  @Get('assignment-submissions/:id')
  @Roles(Role.TEACHER, Role.ADMIN)
  getSubmission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.assignments.getSubmission(user, id);
  }

  @Patch('assignment-submissions/:id/grade')
  @Roles(Role.TEACHER, Role.ADMIN)
  grade(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GradeSubmissionDto,
  ) {
    return this.assignments.gradeSubmission(user, id, dto);
  }

  // --- Archivos privados ---

  /**
   * Descarga un archivo de una entrega. Requiere sesión (token en la cabecera, así que el
   * frontend lo pide con `HttpClient` como blob, no con un enlace directo).
   */
  @Get('submission-files/:name')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('name') name: string,
    @Res() res: Response,
  ) {
    const { path, originalName } = await this.assignments.fileForDownload(
      user,
      name,
    );

    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Siempre como descarga: un documento nunca se muestra dentro de la página.
    // `dotfiles: 'allow'` porque la carpeta privada empieza con punto (.private); el nombre ya
    // se validó contra PRIVATE_NAME, así que no hay forma de salirse de ella.
    res.download(path, originalName, { dotfiles: 'allow' }, (error) => {
      if (error && !res.headersSent) {
        res.status(404).json({ statusCode: 404, message: 'El archivo no existe' });
      }
    });
  }
}
