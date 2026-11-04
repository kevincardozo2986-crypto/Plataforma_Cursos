import { NestFactory } from '@nestjs/core';
import {
  AppModule,
  ObserveInstrument,
  observeEnabled,
} from './app.module.js';

import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // El webhook de POK se firma sobre el cuerpo tal cual llegó: hay que conservarlo sin modificar.
    rawBody: true,
    ...(observeEnabled ? { instrument: ObserveInstrument } : {}),
  });

  app.enableShutdownHooks();

  // Permitir peticiones desde Angular
  app.enableCors({
    origin: 'http://localhost:4200',
    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(
    process.env.PORT ?? 3000,
  );
}

await bootstrap();