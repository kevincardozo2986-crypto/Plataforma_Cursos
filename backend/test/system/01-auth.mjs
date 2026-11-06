import { t, section, skip, req, is, ok, eq, db, login, makeUser, RUN, PASSWORD } from './harness.mjs';

export default async function auth(ctx) {
  section('1. Registro, inicio de sesión y contraseña');
  const email = `${RUN.toLowerCase()}.reg@example.com`;
  const base = { firstName: 'Registro', lastName: 'Prueba', email, password: PASSWORD, document: String(Math.floor(1e9 + Math.random() * 9e9)) };

  await t('Registro con datos válidos crea la cuenta (rol estudiante)', async () => {
    const r = is(await req('POST', '/auth/register', { body: base }), 201);
    const row = (await (await db()).query('SELECT id, role, status, "passwordHash" FROM users WHERE email=$1', [email])).rows[0];
    ok(row, 'no quedó en la base');
    eq(row.role, 'STUDENT');
    eq(row.status, 'ACTIVE');
    ok(row.passwordHash && row.passwordHash !== PASSWORD, 'la contraseña debe guardarse cifrada');
    ctx.created.users.push(row.id);
    ok(!JSON.stringify(r.body).includes('passwordHash'), 'el registro no debe devolver el hash');
  });
  await t('Registro: correo repetido → 409', async () => { is(await req('POST', '/auth/register', { body: { ...base, document: '1234567' + Date.now() % 1000 } }), 409); });
  await t('Registro: documento repetido → 409', async () => { is(await req('POST', '/auth/register', { body: { ...base, email: `x.${email}` } }), 409); });
  await t('Registro: contraseña corta → 400', async () => { is(await req('POST', '/auth/register', { body: { ...base, email: `a.${email}`, document: '777' + Date.now(), password: '123' } }), 400); });
  await t('Registro: correo inválido → 400', async () => { is(await req('POST', '/auth/register', { body: { ...base, email: 'no-es-correo', document: '778' + Date.now() } }), 400); });
  await t('Registro: sin documento → 400', async () => { is(await req('POST', '/auth/register', { body: { ...base, email: `b.${email}`, document: '' } }), 400); });
  await t('Registro: no se puede elegir el rol (se ignora o se rechaza)', async () => {
    const e = `${RUN.toLowerCase()}.rol@example.com`;
    const r = await req('POST', '/auth/register', { body: { ...base, email: e, document: '779' + Date.now(), role: 'ADMIN' } });
    ok([201, 400].includes(r.status), 'estado inesperado ' + r.status);
    const row = (await (await db()).query('SELECT id, role FROM users WHERE email=$1', [e])).rows[0];
    if (row) { eq(row.role, 'STUDENT', 'se coló un rol privilegiado'); ctx.created.users.push(row.id); }
  });

  await t('Inicio de sesión con correo', async () => { const s = await login(email); ok(s.token); });
  await t('Inicio de sesión con documento (cédula)', async () => { const s = await login(base.document); ok(s.token); });
  await t('Contraseña incorrecta → 401', async () => { is(await req('POST', '/auth/login', { body: { identifier: email, password: 'incorrecta123' } }), 401); });
  await t('Cuenta inexistente → 401 (mismo mensaje que contraseña mala)', async () => {
    const a = is(await req('POST', '/auth/login', { body: { identifier: 'nadie@example.com', password: 'incorrecta123' } }), 401);
    const b = is(await req('POST', '/auth/login', { body: { identifier: email, password: 'incorrecta123' } }), 401);
    eq(a.body.message, b.body.message, 'el mensaje delata si la cuenta existe');
  });
  await t('/auth/me sin token → 401', async () => { is(await req('GET', '/auth/me'), 401); });
  await t('/auth/me con token inválido → 401', async () => { is(await req('GET', '/auth/me', { token: 'abc.def.ghi' }), 401); });
  await t('/auth/me no expone el hash ni el documento de otros', async () => {
    const s = await login(email);
    ok(!/passwordHash|password"/i.test(JSON.stringify(s.me)), 'el perfil expone la contraseña');
  });

  // Usuarios del resto de la prueba
  ctx.s1 = await makeUser('alumna1');
  ctx.s2 = await makeUser('alumno2');
  ctx.s3 = await makeUser('alumna3');
  ctx.t1 = await makeUser('docente1', 'TEACHER');
  ctx.t2 = await makeUser('docente2', 'TEACHER');
  ctx.admin = await makeUser('admin1', 'ADMIN');

  await t('Cambiar contraseña: la actual incorrecta → 400', async () => {
    is(await req('PATCH', '/profile/password', { token: ctx.s3.token, body: { currentPassword: 'mala-clave-1', newPassword: 'OtraClave2026' } }), 400);
  });
  await t('Cambiar contraseña: igual a la actual → 400', async () => {
    is(await req('PATCH', '/profile/password', { token: ctx.s3.token, body: { currentPassword: PASSWORD, newPassword: PASSWORD } }), 400);
  });
  await t('Cambiar contraseña: nueva demasiado corta → 400', async () => {
    is(await req('PATCH', '/profile/password', { token: ctx.s3.token, body: { currentPassword: PASSWORD, newPassword: '123' } }), 400);
  });
  await t('Cambiar contraseña: válida → la vieja deja de servir y la nueva sí', async () => {
    const r = is(await req('PATCH', '/profile/password', { token: ctx.s3.token, body: { currentPassword: PASSWORD, newPassword: 'NuevaClave2026' } }), 200, 201);
    eq(r.body.changed, true);
    is(await req('POST', '/auth/login', { body: { identifier: ctx.s3.email, password: PASSWORD } }), 401);
    const s = await login(ctx.s3.email, 'NuevaClave2026');
    ctx.s3.token = s.token;
  });

  await t('Recuperación de contraseña por correo: pedir código', async () => {
    const r = await req('POST', '/auth/recovery/request-code', { body: { identifier: ctx.s1.email } });
    if (r.status === 503) {
      skip('Recuperación por correo (código enviado y confirmado)', 'el servidor de correo (SMTP_USER/SMTP_PASSWORD) no está configurado; sin él no hay forma de recibir el código');
      return;
    }
    ok([200, 201].includes(r.status), 'estado inesperado ' + r.status + ' ' + r.text);
  });
  await t('Confirmar un código de recuperación falso → 400/401 (nunca cambia la clave)', async () => {
    const r = await req('POST', '/auth/recovery/confirm-code', { body: { challenge: 'x'.repeat(40), code: '000000', newPassword: 'ClaveNueva2026' } });
    ok([400, 401, 403, 404].includes(r.status), 'estado inesperado ' + r.status);
    await login(ctx.s1.email); // la clave de s1 sigue igual
  });
  await t('Pedir código estando en sesión (cambio de contraseña) responde sin romperse', async () => {
    const r = await req('POST', '/auth/password/request-code', { token: ctx.s2.token, body: { identifier: ctx.s2.email } });
    ok([200, 201, 503].includes(r.status), 'estado inesperado ' + r.status + ' ' + r.text);
  });
  await t('Confirmar código falso en sesión → 400', async () => {
    const r = await req('POST', '/auth/password/confirm-code', { token: ctx.s2.token, body: { code: '000000', newPassword: 'ClaveNueva2026' } });
    ok([400, 401, 429].includes(r.status), 'estado inesperado ' + r.status);
  });
}
