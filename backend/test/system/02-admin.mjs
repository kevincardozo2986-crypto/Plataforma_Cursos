import { t, section, req, is, ok, eq, login, RUN, PASSWORD } from './harness.mjs';

export default async function admin(ctx) {
  section('2. Administración (solo admin)');
  const { admin: AD, s1, t1 } = ctx;

  await t('Un estudiante no entra a /admin/* (403)', async () => {
    for (const p of ['/admin/overview', '/admin/users', '/admin/courses']) is(await req('GET', p, { token: s1.token }), 403);
  });
  await t('Un docente no entra a /admin/* (403)', async () => { is(await req('GET', '/admin/overview', { token: t1.token }), 403); });
  await t('Sin sesión → 401', async () => { is(await req('GET', '/admin/overview'), 401); });

  await t('Resumen de la plataforma trae usuarios, cursos, inscripciones y certificados', async () => {
    const r = is(await req('GET', '/admin/overview', { token: AD.token }), 200).body;
    ok(r.users.total >= 6 && r.users.STUDENT >= 1 && r.users.TEACHER >= 1 && r.users.ADMIN >= 1, 'conteo de usuarios raro: ' + JSON.stringify(r.users));
    ok('total' in r.courses && 'completionRate' in r.enrollments && 'valid' in r.certificates && Array.isArray(r.recentUsers) && Array.isArray(r.recentCourses));
  });
  await t('Lista de cuentas: paginada, con búsqueda y filtro por rol', async () => {
    const all = is(await req('GET', '/admin/users?limit=5', { token: AD.token }), 200).body;
    ok(all.total >= 6 && all.items.length <= 5);
    const found = is(await req('GET', `/admin/users?q=${encodeURIComponent(s1.email)}`, { token: AD.token }), 200).body;
    ok(found.items.some((u) => u.email === s1.email), 'la búsqueda por correo no encontró la cuenta');
    const teachers = is(await req('GET', '/admin/users?role=TEACHER&limit=100', { token: AD.token }), 200).body;
    ok(teachers.items.length && teachers.items.every((u) => u.role === 'TEACHER'));
  });
  await t('La lista de cuentas nunca trae contraseñas', async () => {
    const r = is(await req('GET', '/admin/users?limit=100', { token: AD.token }), 200);
    ok(!/passwordHash|password"|sessionVersion|resetHash/i.test(r.text), 'se filtró un dato sensible');
  });

  let created;
  await t('Crear una cuenta con rol elegido; la persona puede entrar con la clave inicial', async () => {
    const email = `${RUN.toLowerCase()}.creada@example.com`;
    const r = is(await req('POST', '/admin/users', { token: AD.token, body: { firstName: 'Creada', lastName: 'PorAdmin', email, document: String(Math.floor(1e9 + Math.random() * 9e9)), role: 'TEACHER', password: PASSWORD } }), 201);
    eq(r.body.role, 'TEACHER');
    created = r.body;
    ctx.created.users.push(created.id);
    await login(email);
  });
  await t('Crear cuenta con correo repetido → 409', async () => {
    is(await req('POST', '/admin/users', { token: AD.token, body: { firstName: 'Dup', lastName: 'Dup', email: s1.email, document: '5551' + Date.now(), role: 'STUDENT', password: PASSWORD } }), 409);
  });
  await t('Cambiar el rol surte efecto al instante', async () => {
    is(await req('PATCH', `/admin/users/${created.id}`, { token: AD.token, body: { role: 'STUDENT' } }), 200);
    const s = await login(created.email);
    is(await req('POST', '/categories', { token: s.token, body: { name: `x${RUN}` } }), 403);
  });
  await t('Desactivar una cuenta bloquea el acceso y cierra sus sesiones abiertas', async () => {
    const s = await login(created.email);
    is(await req('PATCH', `/admin/users/${created.id}`, { token: AD.token, body: { status: 'INACTIVE' } }), 200);
    const me = await req('GET', '/auth/me', { token: s.token });
    ok([401, 403].includes(me.status), 'la sesión abierta siguió valiendo: ' + me.status);
    const again = await req('POST', '/auth/login', { body: { identifier: created.email, password: PASSWORD } });
    ok([401, 403].includes(again.status), 'una cuenta inactiva pudo iniciar sesión: ' + again.status);
  });
  await t('Reactivarla permite volver a entrar', async () => {
    is(await req('PATCH', `/admin/users/${created.id}`, { token: AD.token, body: { status: 'ACTIVE' } }), 200);
    await login(created.email);
  });
  await t('Un admin no puede cambiar su propia cuenta (400)', async () => {
    is(await req('PATCH', `/admin/users/${AD.id}`, { token: AD.token, body: { role: 'STUDENT' } }), 400);
  });
  await t('Rol o estado inválido → 400', async () => {
    is(await req('PATCH', `/admin/users/${created.id}`, { token: AD.token, body: { role: 'SUPERUSER' } }), 400);
    is(await req('PATCH', `/admin/users/${created.id}`, { token: AD.token, body: { status: 'BANEADO' } }), 400);
  });
  await t('Cuenta inexistente → 404', async () => { is(await req('PATCH', '/admin/users/99999999', { token: AD.token, body: { role: 'STUDENT' } }), 404); });
  await t('Lista de todos los cursos (con autor y conteos) y filtro por estado', async () => {
    const r = is(await req('GET', '/admin/courses?limit=5', { token: AD.token }), 200).body;
    ok(typeof r.total === 'number' && Array.isArray(r.items));
    is(await req('GET', '/admin/courses?status=PUBLISHED&limit=5', { token: AD.token }), 200);
  });

  section('2b. Categorías');
  let cat;
  await t('Un docente crea una categoría', async () => {
    cat = is(await req('POST', '/categories', { token: t1.token, body: { name: `Cat ${RUN}` } }), 201).body;
    ctx.created.categories.push(cat.id);
    ok(cat.id);
  });
  await t('Un estudiante no puede crear categorías (403)', async () => { is(await req('POST', '/categories', { token: s1.token, body: { name: `Nope ${RUN}` } }), 403); });
  await t('Nombre repetido → 409', async () => { is(await req('POST', '/categories', { token: t1.token, body: { name: `Cat ${RUN}` } }), 409); });
  await t('Listado y detalle son públicos', async () => {
    const list = is(await req('GET', '/categories'), 200).body;
    ok(list.some((c) => c.id === cat.id));
    is(await req('GET', `/categories/${cat.id}`), 200);
    is(await req('GET', '/categories/99999999'), 404);
  });
  await t('Editar una categoría', async () => {
    const r = is(await req('PATCH', `/categories/${cat.id}`, { token: t1.token, body: { name: `Cat ${RUN} editada` } }), 200);
    eq(r.body.name, `Cat ${RUN} editada`);
  });
  ctx.cat = cat;
}
