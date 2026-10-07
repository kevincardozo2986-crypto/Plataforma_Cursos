import { mkdir, writeFile } from 'node:fs/promises';
import { cases } from './register-cases.mjs';

const collection = {
  info: {
    name: 'Plataforma Cursos - Registro',
    description: 'Ejecutar en orden con Collection Runner. Crea usuarios de prueba únicos en cada ejecución. El documento es obligatorio. El login con identifier se verifica por separado en test/login-smoke.mjs.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [{ key: 'baseUrl', value: 'http://localhost:3000' }],
  item: cases.map((test, index) => ({
    name: test.name,
    event: [
      ...(index === 0 ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: [
        "const id = pm.variables.replaceIn('{{$guid}}');",
        "pm.collectionVariables.set('email', 'postman.' + id + '@example.com');",
        "pm.collectionVariables.set('emailUpper', ('postman.' + id + '@example.com').toUpperCase());",
        "pm.collectionVariables.set('secondEmail', 'postman.second.' + id + '@example.com');",
        "pm.collectionVariables.set('thirdEmail', 'postman.third.' + id + '@example.com');",
        "pm.collectionVariables.set('document', 'test-' + id);",
        "pm.collectionVariables.set('otherDocument', 'other-' + id);",
      ] } }] : []),
      { listen: 'test', script: { type: 'text/javascript', exec: [
        `pm.test('Estado HTTP ${test.status}', () => pm.response.to.have.status(${test.status}));`,
        "pm.test('No expone contraseña', () => { const body = pm.response.json(); pm.expect(body).not.to.have.property('password'); pm.expect(body).not.to.have.property('passwordHash'); });",
        ...(test.status === 201 ? ["pm.test('Usuario STUDENT activo', () => { const body = pm.response.json(); pm.expect(body.role).to.eql('STUDENT'); pm.expect(body.status).to.eql('ACTIVE'); pm.expect(body.email).to.eql(pm.collectionVariables.get('email')); });"] : []),
      ] } },
    ],
    request: {
      method: 'POST', header: [{ key: 'Content-Type', value: 'application/json' }],
      body: { mode: 'raw', raw: JSON.stringify(test.body, null, 2), options: { raw: { language: 'json' } } },
      url: '{{baseUrl}}/auth/register',
    },
  })),
};
await mkdir(new URL('../postman/', import.meta.url), { recursive: true });
await writeFile(new URL('../postman/registro.postman_collection.json', import.meta.url), JSON.stringify(collection, null, 2) + '\n');

if (process.argv.includes('--run')) {
  const { NestFactory } = await import('@nestjs/core');
  const { ValidationPipe } = await import('@nestjs/common');
  const rootModule = process.argv.includes('--auth-only')
    ? (await import('./auth-test-module.mjs')).AuthTestModule
    : (await import('../dist/app.module.js')).AppModule;
  const { PrismaService } = await import('../dist/database/prisma.service.js');
  const { randomUUID } = await import('node:crypto');
  const { compare } = await import('bcrypt');
  const id = randomUUID();
  const email = `postman.${id}@example.com`;
  const vars = { email, emailUpper: email.toUpperCase(), secondEmail: `postman.second.${id}@example.com`, thirdEmail: `postman.third.${id}@example.com`, document: `test-${id}`, otherDocument: `other-${id}` };
  const app = await NestFactory.create(rootModule, { logger: false });
  const results = [];
  try {
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    const baseUrl = await app.getUrl();
    for (const test of cases) {
      const payload = JSON.stringify(test.body).replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key]);
      const response = await fetch(`${baseUrl}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
      const body = await response.json();
      let passed = response.status === test.status && !('password' in body) && !('passwordHash' in body);
      if (test.status === 201) {
        const stored = await app.get(PrismaService).user.findUniqueOrThrow({ where: { email } });
        passed &&= body.role === 'STUDENT' && body.status === 'ACTIVE' && body.email === email && await compare(test.body.password, stored.passwordHash);
      }
      results.push({ name: test.name, expected: test.status, actual: response.status, passed });
    }
  } finally {
    await app.get(PrismaService).user.deleteMany({ where: { email: { in: [vars.email, vars.secondEmail, vars.thirdEmail] }, document: { in: [vars.document, vars.otherDocument] } } });
    await app.close();
  }
  console.table(results);
  await writeFile(new URL('../postman/results.json', import.meta.url), JSON.stringify({ date: new Date().toISOString(), results }, null, 2) + '\n');
  if (results.some(result => !result.passed)) process.exitCode = 1;
}
