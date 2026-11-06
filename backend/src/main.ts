import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttpSecurity } from './security/http-security.js';
import { AppModule, ObserveInstrument, observeEnabled } from './app.module.js';

import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // El webhook de POK se firma sobre el cuerpo tal cual llegó: hay que conservarlo sin modificar.
    rawBody: true,
    ...(observeEnabled ? { instrument: ObserveInstrument } : {}),
  });

  app.enableShutdownHooks();
  configureHttpSecurity(app);
  app.useBodyParser('json', { limit: '1mb', strict: true, inflate: false });
  app.useBodyParser('urlencoded', {
    limit: '16kb',
    extended: false,
    inflate: false,
  });

  // Permitir peticiones desde Angular
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:4200')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
