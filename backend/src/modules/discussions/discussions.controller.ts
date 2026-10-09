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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  CreateCommentDto,
  CreateQuestionDto,
  CreateReplyDto,
  ListDiscussionsQueryDto,
  UpdatePostDto,
} from './dto/discussion.dto.js';
import { DiscussionsService } from './discussions.service.js';

/** Participan los estudiantes inscritos y quien gestiona el curso (docente o admin). */
@Controller()
@UseGuards(JwtAuthGuard)
export class DiscussionsController {
  constructor(private readonly discussions: DiscussionsService) {}

  /** `?kind=QUESTION|COMMENT&courseId=&lessonId=&answered=false&limit=20&offset=0` */
  @Get('discussions')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDiscussionsQueryDto,
  ) {
    return this.discussions.list(user, query);
  }

  @Get('discussions/:id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.discussions.findOne(user, id);
  }

  @Post('courses/:courseId/questions')
  askQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.discussions.askQuestion(user, courseId, dto);
  }

  @Post('lessons/:lessonId/comments')
  comment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Body() dto: CreateCommentDto,
  ) {
    return this.discussions.comment(user, lessonId, dto);
  }

  @Post('discussions/:id/replies')
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateReplyDto,
  ) {
    return this.discussions.reply(user, id, dto);
  }

  @Patch('discussions/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePostDto,
  ) {
    return this.discussions.update(user, id, dto);
  }

  @Delete('discussions/:id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.discussions.remove(user, id);
  }
}
