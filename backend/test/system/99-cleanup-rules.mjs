import { t, section, req, is, ok, eq } from './harness.mjs';
import { buildCourse, enroll } from './fixtures.mjs';

export default async function cleanupRules(ctx) {
  const { t1, t2, s1, admin: AD } = ctx;
  section('14. Borrar cursos');
  await t('Un curso con estudiantes inscritos no se borra: hay que archivarlo (409)', async () => {
    const c = await buildCourse(t1, { title: `Con inscritos ${ctx.run}`, lessons: 1 });
    is(await enroll(s1, c), 201, 200);
    const r = is(await req('DELETE', `/courses/${c.id}`, { token: t1.token }), 409);
    ok(/archív/i.test(r.text), r.text);
    is(await req('PATCH', `/courses/${c.id}/status`, { token: t1.token, body: { status: 'ARCHIVED' } }), 200);
  });
  await t('Un curso sin inscritos se borra con su contenido; después da 404 y no sale en ningún listado', async () => {
    const c = await buildCourse(t1, { title: `Para borrar ${ctx.run}`, lessons: 1 });
    is(await req('DELETE', `/courses/${c.id}`, { token: t1.token }), 200);
    is(await req('GET', `/courses/${c.id}`), 404);
    is(await req('GET', `/lessons/${c.lessons[0].id}`, { token: t1.token }), 404);
    ok(!(await req('GET', '/courses/manage', { token: t1.token })).text.includes(`"id":${c.id},`), 'sigue en la lista del docente');
  });
  await t('Borrar un curso inexistente → 404; el admin sí puede borrar uno ajeno sin inscritos', async () => {
    is(await req('DELETE', '/courses/99999999', { token: t1.token }), 404);
    const c = await buildCourse(t2, { title: `Del otro docente ${ctx.run}`, lessons: 1 });
    is(await req('DELETE', `/courses/${c.id}`, { token: AD.token }), 200);
  });
  await t('Un docente puede ver y editar sus borradores sin que aparezcan al público', async () => {
    const d = await buildCourse(t1, { title: `Borrador privado ${ctx.run}`, publish: false });
    is(await req('GET', `/courses/${d.id}`), 404);
    is(await req('PATCH', `/courses/${d.id}`, { token: t1.token, body: { level: 'ADVANCED' } }), 200);
  });
}
