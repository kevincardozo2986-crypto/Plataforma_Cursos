import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';

/** Se ejecuta antes de que Nest registre los controladores. */
export function configureHttpSecurity(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  // Sin confianza implícita en X-Forwarded-For. Configurar IPs/CIDRs del proxy real.
  const proxies = process.env.TRUSTED_PROXIES?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.set('trust proxy', proxies?.length ? proxies : false);
  app.use(helmet());
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.headers.authorization || request.path.startsWith('/auth'))
      response.setHeader('Cache-Control', 'no-store');
    next();
  });
  const makeLimit = (limit: number, windowMs: number) =>
    rateLimit({
      limit,
      windowMs,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        statusCode: 429,
        message: 'Demasiados intentos. Intenta de nuevo más tarde.',
      },
    });
  // Login y registro consumen CPU con bcrypt: el límite se aplica antes de validar credenciales.
  app.use('/auth/login', makeLimit(30, 15 * 60_000));
  app.use('/auth/register', makeLimit(10, 60 * 60_000));
  app.use('/auth/password', makeLimit(15, 15 * 60_000));
  app.use('/profile/password', makeLimit(15, 15 * 60_000));
}
