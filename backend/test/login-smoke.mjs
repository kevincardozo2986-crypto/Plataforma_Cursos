import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../dist/database/prisma.service.js';

const email = `login.${randomUUID()}@example.com`;
const password = 'PruebaLogin2026!';
const document = `00${Date.now()}`;
const rootModule = process.argv.includes('--auth-only')
  ? (await import('./auth-test-module.mjs')).AuthTestModule
  : (await import('../dist/app.module.js')).AppModule;
const app = await NestFactory.create(rootModule, { logger: false });
const prisma = app.get(PrismaService);
const results = [];
let userId;
try {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  const baseUrl = await app.getUrl();
  const post = async (path, body) => {
    const response = await fetch(`${baseUrl}/auth/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const registered = await post('register', { firstName: 'Prueba', lastName: 'Login', email, password, document });
  assert.equal(registered.status, 201, 'No se pudo crear el usuario temporal');
  userId = registered.body.id;
  const cases = [
    { name: 'Login email y firma JWT', body: { identifier: email, password }, status: 201 },
    { name: 'Login documento con ceros iniciales', body: { identifier: document, password }, status: 201 },
    { name: 'Documento con espacios', body: { identifier: `  ${document}  `, password }, status: 201 },
    { name: 'Correo con espacios y mayúsculas', body: { identifier: `  ${email.toUpperCase()}  `, password }, status: 201 },
    { name: 'Contraseña incorrecta email', body: { identifier: email, password: 'Incorrecta2026!' }, status: 401 },
    { name: 'Contraseña incorrecta documento', body: { identifier: document, password: 'Incorrecta2026!' }, status: 401 },
    { name: 'Correo inexistente', body: { identifier: `missing.${randomUUID()}@example.com`, password }, status: 401 },
    { name: 'Documento inexistente', body: { identifier: `missing-${randomUUID()}`, password }, status: 401 },
    { name: 'Identificador vacío', body: { identifier: '', password }, status: 400 },
    { name: 'Identificador solo espacios', body: { identifier: '   ', password }, status: 400 },
    { name: 'Identificador numérico en JSON', body: { identifier: 123456, password }, status: 400 },
    { name: 'Identificador null', body: { identifier: null, password }, status: 400 },
    { name: 'Contraseña corta', body: { identifier: email, password: '1234' }, status: 400 },
    { name: 'Sin contraseña', body: { identifier: email }, status: 400 },
    { name: 'Sin identificador', body: { password }, status: 400 },
    { name: 'Antiguo campo email rechazado', body: { email, password }, status: 400 },
    { name: 'Contraseña de tipo numérico', body: { identifier: email, password: 12345678 }, status: 400 },
    { name: 'Campo adicional role', body: { identifier: email, password, role: 'ADMIN' }, status: 400 },
    { name: 'Usuario INACTIVE email', body: { identifier: email, password }, status: 401, inactive: true },
    { name: 'Usuario INACTIVE documento', body: { identifier: document, password }, status: 401, inactive: true },
  ];
  const unauthorizedMessages = [];
  for (const test of cases) {
    if (test.inactive) await prisma.user.update({ where: { id: userId }, data: { status: 'INACTIVE' } });
    const response = await post('login', test.body);
    let failure;
    try {
      assert.equal(response.status, test.status);
      assert.ok(!('passwordHash' in response.body) && !('password' in response.body));
      if (test.status === 201) {
        assert.ok(!('passwordHash' in response.body.user) && !('password' in response.body.user));
        assert.equal(response.body.user.id, userId);
        const claims = await app.get(JwtService).verifyAsync(response.body.accessToken);
        assert.equal(claims.sub, userId);
        assert.equal(claims.email, email);
        assert.equal(claims.role, 'STUDENT');
        assert.equal(claims.exp - claims.iat, 3600);
        assert.ok(claims.exp > Math.floor(Date.now() / 1000));
        assert.ok(!('passwordHash' in claims) && !('password' in claims));
        const me = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${response.body.accessToken}` } });
        assert.equal(me.status, 200);
        const profile = await me.json();
        assert.equal(profile.id, userId);
        assert.equal(profile.document, document);
        assert.ok(!('passwordHash' in profile));
      } else {
        assert.ok(!('accessToken' in response.body));
      }
      if (test.status === 401 && !test.inactive) unauthorizedMessages.push(response.body.message);
    } catch (error) { failure = error.message; }
    results.push({ name: test.name, expected: test.status, actual: response.status, passed: !failure, ...(failure ? { failure } : {}) });
  }
  results.push({ name: 'Mismo mensaje para identificador inexistente y contraseña incorrecta', passed: unauthorizedMessages.length === 4 && new Set(unauthorizedMessages).size === 1 });
  for (const token of [undefined, 'invalid.jwt.token', await app.get(JwtService).signAsync({ sub: userId }, { expiresIn: -1 }), await app.get(JwtService).signAsync({ sub: userId })]) {
    const response = await fetch(`${baseUrl}/auth/me`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    results.push({ name: 'Guard rechaza token ausente, inválido, expirado o usuario inactivo', expected: 401, actual: response.status, passed: response.status === 401 });
  }
} finally {
  try { await prisma.user.deleteMany({ where: { email, ...(userId ? { id: userId } : {}) } }); }
  finally { await app.close(); }
}
console.table(results.map(({ failure: _failure, ...result }) => result));
await writeFile(new URL('../postman/login-results.json', import.meta.url), JSON.stringify({ date: new Date().toISOString(), results }, null, 2) + '\n');
if (results.some(result => !result.passed)) process.exitCode = 1;
