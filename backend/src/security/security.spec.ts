import express from 'express';
import request from 'supertest';
import {
  ValidationPipe,
  UnauthorizedException,
  Module,
  type ExecutionContext,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import { gzipSync } from 'node:zlib';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { configureHttpSecurity } from './http-security.js';
import { validateSecurityConfig } from './security.config.js';
import { LoginDto } from '../modules/auth/dto/login.dto.js';
import { RegisterDto } from '../modules/auth/dto/register.dto.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { UsersService } from '../modules/users/users.service.js';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard.js';
import { UserStatus, Role } from '../generated/prisma/enums.js';
import type { PrismaService } from '../database/prisma.service.js';
import { PaymentsService } from '../modules/payments/payments.service.js';
import type { PaymentsRepository } from '../modules/payments/payments.repository.js';
import type { ProgressService } from '../modules/progress/progress.service.js';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-request.interface.js';
import type { CheckoutDto } from '../modules/payments/dto/checkout.dto.js';

const secret = 'a-long-test-secret-for-security-tests-only';
const signing = {
  algorithm: 'HS256' as const,
  issuer: 'plataforma-cursos',
  audience: 'plataforma-cursos-web',
  expiresIn: '1h' as const,
};

describe('Seguridad HTTP y login', () => {
  const validation = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const makeApp = () => {
    const app = express();
    configureHttpSecurity(app as unknown as NestExpressApplication);
    app.use(express.json({ limit: '1mb', strict: true, inflate: false }));
    return app;
  };

  it('limita JSON, rechaza compresión y conserva el cuerpo original usado por firmas de webhooks', async () => {
    class SecurityTestModule {}
    Module({})(SecurityTestModule);
    const app = await NestFactory.create<NestExpressApplication>(
      SecurityTestModule,
      { logger: false, rawBody: true },
    );
    configureHttpSecurity(app);
    app.useBodyParser('json', { limit: '1mb', strict: true, inflate: false });
    app.use(
      '/payload',
      (req: Request & { rawBody?: Buffer }, res: Response) => {
        res.json({ raw: req.rawBody?.toString('utf8') });
      },
    );
    await app.init();
    try {
      const raw = '{ "event": "credential-emitted" }';
      const result = await request(app.getHttpServer())
        .post('/payload')
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(200);
      expect(result.body.raw).toBe(raw);
      await request(app.getHttpServer())
        .post('/payload')
        .send({ data: 'x'.repeat(1024 * 1024) })
        .expect(413);
      await request(app.getHttpServer())
        .post('/payload')
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'gzip')
        .send(gzipSync(raw))
        .expect(415);
      await request(app.getHttpServer())
        .post('/payload')
        .set('Content-Type', 'application/json')
        .send('{invalid')
        .expect(400);
    } finally {
      await app.close();
    }
  });

  it('bloquea fuerza bruta aunque roten el encabezado X-Forwarded-For', async () => {
    const previous = process.env.TRUSTED_PROXIES;
    delete process.env.TRUSTED_PROXIES;
    try {
      const app = makeApp();
      app.post('/auth/login', (_req, res) => res.status(401).json({}));
      for (let index = 0; index < 30; index++) {
        await request(app)
          .post('/auth/login')
          .set('X-Forwarded-For', `192.0.2.${index}`)
          .send({})
          .expect(401);
      }
      const blocked = await request(app)
        .post('/auth/login')
        .send({})
        .expect(429);
      expect(blocked.headers['retry-after']).toBeDefined();
      expect(blocked.headers['x-powered-by']).toBeUndefined();
      expect(blocked.headers['x-content-type-options']).toBe('nosniff');
    } finally {
      if (previous === undefined) delete process.env.TRUSTED_PROXIES;
      else process.env.TRUSTED_PROXIES = previous;
    }
  });

  it('trata SQL y JavaScript como datos, rechaza objetos y nunca emite un token con credenciales falsas', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const prisma = { user: { findUnique } } as unknown as PrismaService;
    const users = new UsersService(prisma);
    const jwt = new JwtService({ secret, signOptions: signing });
    const auth = new AuthService(users, jwt);
    const app = makeApp();
    app.post('/auth/login', async (req, res) => {
      try {
        const dto = await validation.transform(req.body, {
          type: 'body',
          metatype: LoginDto,
        });
        res.json(await auth.login(dto));
      } catch (error) {
        const status =
          error && typeof error === 'object' && 'getStatus' in error
            ? (error as { getStatus(): number }).getStatus()
            : 500;
        res.status(status).json({ statusCode: status });
      }
    });
    for (const identifier of [
      "' OR 1=1 --",
      '<script>alert(1)</script>',
      "admin@example.com' OR 1=1 --",
    ]) {
      const response = await request(app)
        .post('/auth/login')
        .send({ identifier, password: 'invalid-password' })
        .expect(401);
      expect(response.body.accessToken).toBeUndefined();
      const where = findUnique.mock.calls.at(-1)?.[0].where;
      expect(Object.values(where)).toContain(
        identifier.includes('@') ? identifier.toLowerCase() : identifier,
      );
    }
    findUnique.mockClear();
    for (const body of [
      { identifier: { $ne: null }, password: 'invalid-password' },
      { identifier: 'admin@example.com', password: ['invalid-password'] },
      {
        identifier: 'admin@example.com',
        password: 'invalid-password',
        role: 'ADMIN',
      },
      { identifier: 'a'.repeat(255), password: 'invalid-password' },
      { identifier: 'admin@example.com', password: 'a'.repeat(73) },
    ])
      await request(app).post('/auth/login').send(body).expect(400);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('no permite asignar un rol mediante el registro público', async () => {
    await expect(
      validation.transform(
        {
          firstName: 'Prueba',
          lastName: 'Seguridad',
          email: 'test@example.com',
          document: '12345',
          password: 'ClavePrueba123!',
          role: 'ADMIN',
        },
        { type: 'body', metatype: RegisterDto },
      ),
    ).rejects.toThrow();
  });

  it('mantiene el login válido y usa el mismo error para cuentas inactivas e inexistentes', async () => {
    const account = {
      id: 1,
      email: 'test@example.com',
      role: Role.STUDENT,
      sessionVersion: 0,
      status: UserStatus.ACTIVE,
      passwordHash: await bcrypt.hash('ClavePrueba123!', 12),
    };
    const users = {
      findByEmail: vi.fn().mockResolvedValue(account),
      findById: vi.fn().mockResolvedValue({ id: 1 }),
    } as unknown as UsersService;
    const jwt = new JwtService({ secret, signOptions: signing });
    const auth = new AuthService(users, jwt);
    const result = await auth.login({
      identifier: account.email,
      password: 'ClavePrueba123!',
    });
    expect(
      jwt.verify(result.accessToken, {
        issuer: signing.issuer,
        audience: signing.audience,
      }).sub,
    ).toBe(1);
    account.status = UserStatus.INACTIVE;
    await expect(
      auth.login({ identifier: account.email, password: 'ClavePrueba123!' }),
    ).rejects.toThrow('Identificador o contraseña incorrectos');
  });
});

describe('Sesiones y configuración de producción', () => {
  it('nunca aprueba un pago simulado ni inscribe estudiantes en producción', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const create = vi.fn();
    const enroll = vi.fn();
    try {
      const payments = new PaymentsService(
        { create } as unknown as PaymentsRepository,
        { enroll } as unknown as ProgressService,
      );
      await expect(
        payments.checkout({ id: 1 } as AuthenticatedUser, 1, {} as CheckoutDto),
      ).rejects.toThrow('Los pagos en línea no están habilitados');
      expect(create).not.toHaveBeenCalled();
      expect(enroll).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
  const jwt = new JwtService({ secret });
  const user = {
    id: 1,
    role: Role.STUDENT,
    status: UserStatus.ACTIVE,
    sessionVersion: 1,
  };
  const users = {
    findById: vi.fn().mockResolvedValue(user),
  } as unknown as UsersService;
  const guard = new JwtAuthGuard(
    jwt,
    new ConfigService({ JWT_SECRET: secret }),
    users,
  );
  const context = (token: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: `Bearer ${token}` } }),
      }),
    }) as unknown as ExecutionContext;

  it('rechaza tokens alterados, de otra aplicación, de algoritmo distinto o de una sesión invalidada', async () => {
    const payload = {
      sub: 1,
      email: 'test@example.com',
      role: 'ADMIN',
      version: 1,
    };
    const valid = jwt.sign(payload, signing);
    await expect(guard.canActivate(context(valid))).resolves.toBe(true);
    for (const token of [
      valid + 'tampered',
      jwt.sign(payload),
      jwt.sign(payload, { ...signing, algorithm: 'HS384' }),
      jwt.sign({ ...payload, version: 0 }, signing),
      jwt.sign({ ...payload, sub: '1 OR 1=1' }, signing),
      jwt.sign(payload, { ...signing, expiresIn: -1 }),
    ]) {
      await expect(guard.canActivate(context(token))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('invalida sesiones al guardar una contraseña nueva', async () => {
    const update = vi.fn().mockResolvedValue({});
    const service = new UsersService({
      user: { update },
    } as unknown as PrismaService);
    await service.updatePasswordHash(1, 'new-hash');
    expect(update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { passwordHash: 'new-hash', sessionVersion: { increment: 1 } },
    });
  });

  it('impide iniciar producción con secretos de ejemplo, HTTP o CORS abierto', () => {
    const valid = {
      NODE_ENV: 'production',
      JWT_SECRET: 'c9bfefed8b5240659ab6387bcb11d4258e4125da6c65e7c3',
      APP_URL: 'https://campus.example.edu/cursos-virtuales',
      CORS_ORIGINS: 'https://campus.example.edu',
    };
    expect(validateSecurityConfig(valid)).toBe(valid);
    for (const invalid of [
      { JWT_SECRET: 'short' },
      { JWT_SECRET: 'CHANGE_ME_'.repeat(5) },
      { APP_URL: 'http://campus.example.edu' },
      { CORS_ORIGINS: '*' },
      { CORS_ORIGINS: 'https://campus.example.edu/path' },
      { CORS_ORIGINS: '' },
    ]) {
      expect(() => validateSecurityConfig({ ...valid, ...invalid })).toThrow();
    }
  });
});
