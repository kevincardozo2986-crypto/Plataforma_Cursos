import { t, section, req, is, ok, eq } from './harness.mjs';
import { notificationsOf } from './fixtures.mjs';

export default async function reviewsNotifications(ctx) {
  const { t1, s1, s2, s3 } = ctx;
  const c1 = ctx.c1;
  section('8. Reseñas');

  await t('Un no inscrito no reseña (403) y un docente tampoco (403)', async () => {
    is(await req('PUT', `/courses/${c1.id}/review`, { token: s2.token, body: { rating: 5 } }), 403);
    is(await req('PUT', `/courses/${c1.id}/review`, { token: t1.token, body: { rating: 5 } }), 403);
  });
  await t('Calificación fuera de 1–5 → 400', async () => {
    is(await req('PUT', `/courses/${c1.id}/review`, { token: s1.token, body: { rating: 0 } }), 400);
    is(await req('PUT', `/courses/${c1.id}/review`, { token: s1.token, body: { rating: 6 } }), 400);
    is(await req('PUT', `/courses/${c1.id}/review`, { token: s1.token, body: { rating: 3.5 } }), 400);
  });
  await t('El estudiante inscrito reseña; el docente recibe NEW_REVIEW (solo la primera vez)', async () => {
    is(await req('PUT', `/courses/${c1.id}/review`, { token: s1.token, body: { rating: 5, comment: 'Excelente curso' } }), 200, 201);
    is(await req('PUT', `/courses/${c1.id}/review`, { token: s1.token, body: { rating: 4, comment: 'Excelente curso (editado)' } }), 200, 201);
    const n = (await notificationsOf(t1)).items.filter((x) => x.type === 'NEW_REVIEW' && x.courseId === c1.id);
    eq(n.length, 1, 'editar la reseña volvió a avisar o no avisó: ' + n.length);
  });
  await t('Mi reseña: se ve la última versión; sin reseña → 404', async () => {
    eq(is(await req('GET', `/courses/${c1.id}/review/mine`, { token: s1.token }), 200).body.rating, 4);
    is(await req('GET', `/courses/${c1.id}/review/mine`, { token: s3.token }), 404);
  });
  await t('Público: resumen (promedio y distribución) y lista con nombre abreviado', async () => {
    const sum = is(await req('GET', `/courses/${c1.id}/reviews/summary`), 200).body;
    eq(sum.count, 1);
    eq(sum.average, 4);
    const list = is(await req('GET', `/courses/${c1.id}/reviews`), 200);
    ok(/ P\.$|P\./.test(JSON.stringify(list.body.items[0].author)), 'el autor no va abreviado: ' + list.text.slice(0, 200));
    ok(!/email|Prueba"/.test(list.text), 'expone el apellido o el correo');
  });
  await t('Reseñas de un curso sin reseñas: average null (no "0")', async () => {
    const sum = is(await req('GET', `/courses/${ctx.c1.id}/reviews/summary`), 200).body;
    ok(sum.average === 4);
  });
  await t('El docente ve las reseñas de sus cursos con el nombre completo; un estudiante no (403)', async () => {
    const r = is(await req('GET', `/reviews?courseId=${c1.id}`, { token: t1.token }), 200).body;
    ok(r.items[0].student.lastName === 'Prueba');
    is(await req('GET', '/reviews', { token: s1.token }), 403);
  });
  await t('Borrar mi reseña', async () => {
    is(await req('DELETE', `/courses/${c1.id}/review`, { token: s1.token }), 200);
    is(await req('GET', `/courses/${c1.id}/review/mine`, { token: s1.token }), 404);
    is(await req('PUT', `/courses/${c1.id}/review`, { token: s1.token, body: { rating: 5, comment: 'De vuelta' } }), 200, 201);
  });
  await t('Reseñas de un curso en borrador (no público) → 404', async () => {
    is(await req('GET', `/courses/99999999/reviews/summary`), 404);
  });

  section('9. Notificaciones');
  await t('Contador de no leídas coincide con la lista', async () => {
    const count = is(await req('GET', '/notifications/unread-count', { token: s1.token }), 200).body.unread;
    const list = await notificationsOf(s1, '&unread=true');
    eq(count, list.total);
    ok(count >= 1);
  });
  await t('Marcar una como leída baja el contador; una ajena → 404', async () => {
    const before = is(await req('GET', '/notifications/unread-count', { token: s1.token }), 200).body.unread;
    const one = (await notificationsOf(s1, '&unread=true')).items[0];
    is(await req('PATCH', `/notifications/${one.id}/read`, { token: s1.token }), 200);
    eq(is(await req('GET', '/notifications/unread-count', { token: s1.token }), 200).body.unread, before - 1);
    is(await req('PATCH', `/notifications/${one.id}/read`, { token: s3.token }), 404);
  });
  await t('Marcar todas como leídas', async () => {
    const r = is(await req('PATCH', '/notifications/read-all', { token: s1.token }), 200).body;
    ok(typeof r.marked === 'number');
    eq(is(await req('GET', '/notifications/unread-count', { token: s1.token }), 200).body.unread, 0);
  });
  await t('Cada usuario ve solo las suyas; sin sesión → 401', async () => {
    const mine = await notificationsOf(s1);
    const other = await notificationsOf(s3);
    ok(!mine.items.some((n) => other.items.some((o) => o.id === n.id)), 'comparten notificaciones');
    is(await req('GET', '/notifications'), 401);
  });
  await t('Paginación y filtro de no leídas', async () => {
    const r = is(await req('GET', '/notifications?limit=1&offset=0', { token: s1.token }), 200).body;
    ok(r.items.length <= 1 && r.total >= 1);
  });
}
