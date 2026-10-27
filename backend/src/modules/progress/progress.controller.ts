import { VideoWatchDto } from './dto/video-watch.dto.js';
import {
  Body,
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
import { EnrollDto } from './dto/enroll.dto.js';
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
    @Body() dto: EnrollDto,
  ) {
    return this.progress.enroll(user, courseId, dto.password);
  }

  @Delete('courses/:courseId/enroll')
  @Roles(Role.STUDENT)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.progress.cancel(user, courseId);
  }

  @Get('enrollments/streak')
  @Roles(Role.STUDENT)
  streak(@CurrentUser() user: AuthenticatedUser) {
    return this.progress.studyStreak(user);
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

  @Get('lessons/:lessonId/video-progress')
  @Roles(Role.STUDENT)
  videoState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseIntPipe) id: number,
  ) {
    return this.progress.videoState(user, id);
  }

  @Post('lessons/:lessonId/video-progress')
  @Roles(Role.STUDENT)
  recordVideo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseIntPipe) id: number,
    @Body() dto: VideoWatchDto,
  ) {
    return this.progress.recordVideo(user, id, dto);
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
