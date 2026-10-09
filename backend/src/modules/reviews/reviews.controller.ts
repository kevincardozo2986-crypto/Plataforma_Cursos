import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ListReviewsQueryDto, SaveReviewDto } from './dto/review.dto.js';
import { ReviewsService } from './reviews.service.js';

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  // --- Público (sin sesión) ---

  /** `?rating=5&limit=20&offset=0`. Solo cursos publicados. */
  @Get('courses/:courseId/reviews')
  listPublic(
    @Param('courseId', ParseIntPipe) courseId: number,
    @Query() query: ListReviewsQueryDto,
  ) {
    return this.reviews.listPublic(courseId, query);
  }

  @Get('courses/:courseId/reviews/summary')
  summary(@Param('courseId', ParseIntPipe) courseId: number) {
    return this.reviews.summary(courseId);
  }

  // --- Estudiante inscrito ---

  /** Crea o reemplaza mi reseña del curso. */
  @Put('courses/:courseId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() dto: SaveReviewDto,
  ) {
    return this.reviews.saveMine(user, courseId, dto);
  }

  @Get('courses/:courseId/review/mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  mine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.reviews.mine(user, courseId);
  }

  @Delete('courses/:courseId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.reviews.removeMine(user, courseId);
  }

  // --- Docente ---

  /** Reseñas de mis cursos: `?courseId=&rating=&limit=20&offset=0`. */
  @Get('reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  listForTeacher(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListReviewsQueryDto,
  ) {
    return this.reviews.listForTeacher(user, query);
  }
}
