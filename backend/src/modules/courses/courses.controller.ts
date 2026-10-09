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
import { CourseInstructorsService } from './course-instructors.service.js';
import { CoursesService } from './courses.service.js';
import { AddInstructorDto } from './dto/instructor.dto.js';
import {
  CreateCourseDto,
  ListCoursesQueryDto,
  UpdateCourseDto,
  UpdateCourseStatusDto,
} from './dto/course.dto.js';

@Controller('courses')
export class CoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly instructors: CourseInstructorsService,
  ) {}

  // --- Catálogo público (solo cursos publicados) ---

  @Get()
  list(@Query() query: ListCoursesQueryDto) {
    return this.courses.listPublished(query);
  }

  // --- Gestión (profesor dueño o admin). Van antes de ':id' ---

  @Get('manage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  listManaged(@CurrentUser() user: AuthenticatedUser) {
    return this.courses.listManaged(user);
  }

  @Get('manage/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  findManaged(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.courses.findManaged(user, id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.courses.findPublished(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCourseDto,
  ) {
    return this.courses.create(user, dto);
  }

  /** Crea un borrador vacío: es lo que hace el asistente de creación al abrirse. */
  @Post('draft')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  createDraft(@CurrentUser() user: AuthenticatedUser) {
    return this.courses.createDraft(user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.courses.update(user, id, dto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourseStatusDto,
  ) {
    return this.courses.updateStatus(user, id, dto.status);
  }

  /** Solo el autor del curso (o un admin) puede borrarlo. */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.courses.remove(user, id);
  }

  // --- Equipo del curso: autor e instructores ---

  /** Autor e instructores. Lo ve quien gestiona el curso. */
  @Get(':id/instructors')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  team(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.instructors.team(user, id);
  }

  /** Agrega a un docente como instructor, por su correo. Solo el autor o un admin. */
  @Post(':id/instructors')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  addInstructor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddInstructorDto,
  ) {
    return this.instructors.add(user, id, dto.email);
  }

  /** El autor (o un admin) quita a un instructor; un instructor puede salirse él mismo. */
  @Delete(':id/instructors/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  removeInstructor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.instructors.remove(user, id, userId);
  }
}
