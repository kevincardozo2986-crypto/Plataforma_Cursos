import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { CourseModulesModule } from './modules/course-modules/course-modules.module.js';
import { LessonsModule } from './modules/lessons/lessons.module.js';
import { ResourcesModule } from './modules/resources/resources.module.js';
import { EvaluationsModule } from './modules/evaluations/evaluations.module.js';
import { ProgressModule } from './modules/progress/progress.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

export const observeEnabled = Boolean(
  process.env.OBSERVE_APP_KEY && process.env.OBSERVE_APP_SECRET,
);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    DatabaseModule,

    ...(observeEnabled
      ? [
        ObserveModule.forRoot({
          appKey: process.env.OBSERVE_APP_KEY ?? '',
          appSecret: process.env.OBSERVE_APP_SECRET ?? '',
          serviceId: 'backend',
        }),
      ]
      : []),

    UsersModule,
    AuthModule,

    CategoriesModule,
    CoursesModule,
    CourseModulesModule,
    LessonsModule,
    ResourcesModule,
    EvaluationsModule,
    ProgressModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }