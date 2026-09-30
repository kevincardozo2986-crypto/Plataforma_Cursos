import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ProgressService } from './progress.service.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Post('courses/:courseId/enroll')
  @Roles(Role.STUDENT)
  enroll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.progress.enroll(user, courseId);
  }

  @Delete('courses/:courseId/enroll')
  @Roles(Role.STUDENT)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.progress.cancel(user, courseId);
  }

  @Get('enrollments/mine')
  @Roles(Role.STUDENT)
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.progress.myEnrollments(user);
  }

  @Get('courses/:courseId/enrollments')
  @Roles(Role.TEACHER, Role.ADMIN)
  courseEnrollments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.progress.courseEnrollments(user, courseId);
  }

  @Get('courses/:courseId/progress')
  @Roles(Role.STUDENT)
  courseProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.progress.courseProgress(user, courseId);
  }

  @Post('lessons/:lessonId/complete')
  @Roles(Role.STUDENT)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseIntPipe) lessonId: number,
  ) {
    return this.progress.completeLesson(user, lessonId);
  }

  @Delete('lessons/:lessonId/complete')
  @Roles(Role.STUDENT)
  uncomplete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseIntPipe) lessonId: number,
  ) {
    return this.progress.uncompleteLesson(user, lessonId);
  }
}
