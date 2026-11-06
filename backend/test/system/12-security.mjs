import { t, section, req, is, ok, eq, login, PASSWORD } from './harness.mjs';

export default async function security(ctx) {
  const { t1, t2, s1, s2, admin: AD } = ctx;
  const c1 = ctx.c1;
  section('13. Seguridad: permisos entre usuarios y entradas maliciosas');

  await t('Un docente ajeno no edita, borra ni gestiona el curso de otro (403)', async () => {
    is(await req('PATCH', `/courses/${c1.id}`, { token: t2.token, body: { title: 'Secuestrado' } }), 403);
    is(await req('PATCH', `/courses/${c1.id}/status`, { token: t2.token, body: { status: 'ARCHIVED' } }), 403);
    is(await req('DELETE', `/courses/${c1.id}`, { token: t2.token }), 403);
    is(await req('GET', `/courses/manage/${c1.id}`, { token: t2.token }), 403);
    is(await req('POST', `/courses/${c1.id}/modules`, { token: t2.token, body: { title: 'Intruso' } }), 403);
    is(await req('PATCH', `/modules/${c1.mod1.id}`, { token: t2.token, body: { title: 'xx' } }), 403);
    is(await req('POST', `/modules/${c1.mod1.id}/lessons`, { token: t2.token, body: { title: 'Intruso' } }), 403);
    is(await req('PATCH', `/lessons/${c1.l1.id}`, { token: t2.token, body: { title: 'xx' } }), 403);
    is(await req('DELETE', `/lessons/${c1.l1.id}`, { token: t2.token }), 403);
    is(await req('POST', `/modules/${c1.mod1.id}/evaluations`, { token: t2.token, body: { title: 'Intruso', passingScore: 50, questions: [] } }), 403, 400);
    is(await req('POST', `/modules/${c1.mod1.id}/assignments`, { token: t2.token, body: { title: 'Intruso' } }), 403);
    is(await req('PATCH', `/evaluations/${c1.ev.id}`, { token: t2.token, body: { title: 'xx' } }), 403);
    is(await req('DELETE', `/assignments/${c1.a1.id}`, { token: t2.token }), 403);
  });
  await t('Un estudiante no gestiona nada del docente (403)', async () => {
    is(await req('PATCH', `/courses/${c1.id}`, { token: s1.token, body: { title: 'Mío' } }), 403);
    is(await req('DELETE', `/courses/${c1.id}`, { token: s1.token }), 403);
    is(await req('POST', `/courses/${c1.id}/modules`, { token: s1.token, body: { title: 'xx' } }), 403);
    is(await req('GET', '/courses/manage', { token: s1.token }), 403);
    is(await req('GET', '/certificate-templates', { token: s1.token }), 403);
  });
  await t('Todas las rutas privadas exigen sesión (401 sin token)', async () => {
    const paths = [['GET', '/profile'], ['GET', '/notifications'], ['GET', '/enrollments/mine'], ['GET', '/certificates/mine'], ['GET', '/courses/manage'], ['GET', '/dashboard/teacher'],
      ['GET', '/admin/overview'], ['GET', '/announcements'], ['GET', '/discussions'], ['GET', '/payments/mine'], ['GET', '/reviews'], ['GET', '/evaluation-attempts'], ['GET', '/assignment-submissions'],
      ['POST', `/courses/${c1.id}/enroll`], ['PATCH', `/courses/${c1.id}`], ['DELETE', `/courses/${c1.id}`], ['GET', `/modules/${c1.mod1.id}/lessons`], ['GET', '/certificate-fonts'], ['GET', '/pok/status']];
    for (const [m, p] of paths) { const r = await req(m, p); eq(r.status, 401, `${m} ${p} respondió ${r.status} sin sesión`); }
  });
  await t('Las rutas públicas sí abren sin sesión: catálogo, detalle, categorías, reseñas, verificación', async () => {
    for (const p of ['/courses?limit=2', `/courses/${c1.id}`, '/categories', `/courses/${c1.id}/reviews`, '/']) is(await req('GET', p), 200);
  });
  await t('No se puede elevar el propio rol por el perfil ni el registro (se ignora o 400)', async () => {
    const r = await req('PATCH', '/profile', { token: s1.token, body: { role: 'ADMIN' } });
    ok([200, 400].includes(r.status));
    const me = is(await req('GET', '/profile', { token: s1.token }), 200).body;
    eq(me.account.role, 'STUDENT');
    is(await req('GET', '/admin/overview', { token: s1.token }), 403);
  });
  await t('Asignación masiva: cambiar teacherId/status/slug de un curso por PATCH no funciona', async () => {
    const before = is(await req('GET', `/courses/manage/${c1.id}`, { token: t1.token }), 200).body;
    const r = await req('PATCH', `/courses/${c1.id}`, { token: t1.token, body: { teacherId: t2.id, createdAt: '2000-01-01' } });
    ok([200, 400].includes(r.status));
    eq(is(await req('GET', `/courses/manage/${c1.id}`, { token: t1.token }), 200).body.teacherId, before.teacherId, 'se pudo cambiar el autor del curso');
  });
  await t('Inyección SQL / caracteres raros en búsquedas no rompen nada (sin 500)', async () => {
    for (const q of ["' OR 1=1 --", '"; DROP TABLE users; --', '%27%20OR%20%271%27%3D%271', '<script>alert(1)</script>', '\\', '%00']) {
      const a = await req('GET', `/courses?search=${encodeURIComponent(q)}`);
      ok(a.status < 500, `catálogo con "${q}" → ${a.status}`);
      const b = await req('GET', `/admin/users?q=${encodeURIComponent(q)}`, { token: AD.token });
      ok(b.status < 500, `admin/users con "${q}" → ${b.status}`);
      const c = await req('GET', `/dashboard/teacher/students?q=${encodeURIComponent(q)}`, { token: t1.token });
      ok(c.status < 500, `inscritos con "${q}" → ${c.status}`);
    }
    is(await req('GET', '/courses?limit=1'), 200); // la tabla sigue viva
  });
  await t('Ids malformados (texto, negativos, enormes) → 4xx, nunca 500', async () => {
    for (const p of ['/courses/abc', '/courses/-1', '/courses/99999999999999999999', '/lessons/xyz', '/modules/1.5/lessons']) {
      const r = await req('GET', p, { token: t1.token });
      ok(r.status >= 400 && r.status < 500, `${p} → ${r.status}`);
    }
  });
  await t('Cuerpos inválidos o enormes → 400/413, nunca 500', async () => {
    const r1 = await req('POST', '/auth/login', { body: { identifier: 123, password: { a: 1 } } });
    ok(r1.status >= 400 && r1.status < 500, 'login con tipos raros → ' + r1.status);
    const r2 = await req('POST', '/auth/login', { headers: { 'Content-Type': 'application/json' }, body: undefined });
    ok(r2.status >= 400 && r2.status < 500, 'login sin cuerpo → ' + r2.status);
    const r3 = await req('PATCH', '/profile', { token: s1.token, body: { bio: 'x'.repeat(100000) } });
    ok(r3.status === 400 || r3.status === 413, 'bio gigante → ' + r3.status);
  });
  await t('Token manipulado o de otra firma → 401', async () => {
    const parts = s1.token.split('.');
    const forged = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: AD.id, role: 'ADMIN' })).toString('base64url')}.${parts[2]}`;
    is(await req('GET', '/admin/overview', { token: forged }), 401);
    is(await req('GET', '/auth/me', { token: 'Bearer ' + s1.token }), 401);
  });
  await t('Fuerza bruta: muchos intentos fallidos seguidos no tumban el servidor y no dan 500', async () => {
    const out = await Promise.all(Array.from({ length: 15 }, () => req('POST', '/auth/login', { body: { identifier: s2.email, password: 'mala-clave-' + Math.random() } })));
    ok(out.every((r) => r.status === 401 || r.status === 429), 'estados: ' + [...new Set(out.map((r) => r.status))]);
    const limited = out.some((r) => r.status === 429);
    ctx.bruteForceLimited = limited;
  });
  await t('Carga concurrente: 30 lecturas del catálogo en paralelo responden 200', async () => {
    const out = await Promise.all(Array.from({ length: 30 }, () => req('GET', '/courses?limit=5')));
    ok(out.every((r) => r.status === 200), 'estados: ' + [...new Set(out.map((r) => r.status))]);
  });
  await t('Borrar una categoría: docente 403; admin sí (sus cursos quedan sin categoría)', async () => {
    is(await req('DELETE', `/categories/${ctx.cat.id}`, { token: t1.token }), 403);
    is(await req('DELETE', `/categories/${ctx.cat.id}`, { token: AD.token }), 200);
    eq(is(await req('GET', `/courses/manage/${c1.id}`, { token: t1.token }), 200).body.categoryId, null);
  });
  await t('Con la sesión cerrada por el admin (cuenta inactiva) el token ya no sirve', async () => {
    const victim = await (await import('./harness.mjs')).makeUser('victima');
    is(await req('GET', '/auth/me', { token: victim.token }), 200);
    is(await req('PATCH', `/admin/users/${victim.id}`, { token: AD.token, body: { status: 'INACTIVE' } }), 200);
    ok([401, 403].includes((await req('GET', '/auth/me', { token: victim.token })).status));
  });
}
