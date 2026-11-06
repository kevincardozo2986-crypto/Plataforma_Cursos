import { t, section, req, is, ok, eq } from './harness.mjs';
import { buildCourse, enroll, notificationsOf, rows } from './fixtures.mjs';

export default async function communication(ctx) {
  const { t1, t2, s1, s2, s3 } = ctx;
  const c1 = ctx.c1;
  section('7. Anuncios');
  let ann;
  await t('El docente publica un anuncio con aviso a los inscritos (HTML se limpia)', async () => {
    ann = is(await req('POST', `/courses/${c1.id}/announcements`, { token: t1.token, body: { title: 'Cambio de horario', body: '<p>La clase será a las <b>8am</b></p><script>alert(1)</script>', notify: true } }), 201).body;
    ok(ann.notified >= 1, 'no avisó a nadie: ' + JSON.stringify(ann));
    ok(!/<script/i.test(ann.body ?? ''), 'no se limpió el HTML');
  });
  await t('El estudiante inscrito recibe la notificación ANNOUNCEMENT y ve el anuncio', async () => {
    const n = await notificationsOf(s1);
    ok(n.items.some((x) => x.type === 'ANNOUNCEMENT' && x.refId === ann.id), 'falta el aviso');
    const list = is(await req('GET', `/announcements?courseId=${c1.id}`, { token: s1.token }), 200).body;
    ok(list.items.some((a) => a.id === ann.id));
  });
  await t('Un estudiante NO inscrito no ve anuncios de ese curso (403 o vacío) y no recibe aviso', async () => {
    const r = await req('GET', `/announcements?courseId=${c1.id}`, { token: s2.token });
    ok(r.status === 403 || (r.status === 200 && !r.body.items.some((a) => a.id === ann.id)), 've anuncios de un curso ajeno');
    ok(!(await notificationsOf(s2)).items.some((x) => x.type === 'ANNOUNCEMENT' && x.refId === ann.id));
  });
  await t('Un estudiante no publica anuncios (403); un docente ajeno tampoco', async () => {
    is(await req('POST', `/courses/${c1.id}/announcements`, { token: s1.token, body: { title: 'Hola', body: '<p>x</p>' } }), 403);
    is(await req('POST', `/courses/${c1.id}/announcements`, { token: t2.token, body: { title: 'Hola', body: '<p>x</p>' } }), 403);
  });
  await t('Anuncio sin texto visible → 400; silencioso (notify=false) no avisa', async () => {
    is(await req('POST', `/courses/${c1.id}/announcements`, { token: t1.token, body: { title: 'Vacío', body: '<p></p>' } }), 400);
    const quiet = is(await req('POST', `/courses/${c1.id}/announcements`, { token: t1.token, body: { title: 'Silencioso', body: '<p>sin aviso</p>', notify: false } }), 201).body;
    eq(quiet.notified, 0);
  });
  await t('Editar y borrar un anuncio', async () => {
    const r = is(await req('PATCH', `/announcements/${ann.id}`, { token: t1.token, body: { title: 'Cambio de horario (editado)' } }), 200).body;
    eq(r.title, 'Cambio de horario (editado)');
    is(await req('PATCH', `/announcements/${ann.id}`, { token: t2.token, body: { title: 'xx' } }), 403, 404);
    is(await req('DELETE', `/announcements/${ann.id}`, { token: t1.token }), 200);
    const list = is(await req('GET', `/announcements?courseId=${c1.id}`, { token: t1.token }), 200).body;
    ok(!list.items.some((a) => a.id === ann.id));
  });

  section('7b. Preguntas, respuestas y comentarios');
  let q;
  await t('El estudiante inscrito hace una pregunta (con lección) y el docente recibe NEW_QUESTION', async () => {
    q = is(await req('POST', `/courses/${c1.id}/questions`, { token: s1.token, body: { title: '¿Cómo instalo Angular?', body: 'Me da error en npm install', lessonId: c1.l1.id } }), 201).body;
    eq(q.answered, false);
    const n = await notificationsOf(t1);
    ok(n.items.some((x) => x.type === 'NEW_QUESTION' && x.refId === q.id), 'el docente no recibió aviso');
  });
  await t('Pregunta con lección de otro curso o título corto → 400', async () => {
    const other = await buildCourse(t1, { title: `Otro ${ctx.run}`, lessons: 1 });
    is(await req('POST', `/courses/${c1.id}/questions`, { token: s1.token, body: { title: 'Pregunta válida', body: 'cuerpo', lessonId: other.lessons[0].id } }), 400);
    is(await req('POST', `/courses/${c1.id}/questions`, { token: s1.token, body: { title: 'a', body: '' } }), 400);
  });
  await t('Un estudiante no inscrito no pregunta ni lee (403)', async () => {
    is(await req('POST', `/courses/${c1.id}/questions`, { token: s2.token, body: { title: 'Intruso', body: 'hola' } }), 403);
    is(await req('GET', `/discussions/${q.id}`, { token: s2.token }), 403, 404);
  });
  await t('Las preguntas sin responder aparecen en la bandeja del docente (answered=false)', async () => {
    const r = is(await req('GET', '/discussions?kind=QUESTION&answered=false', { token: t1.token }), 200).body;
    ok(rows(r).some((d) => d.id === q.id));
  });
  await t('Una respuesta de OTRO ESTUDIANTE no marca la pregunta como respondida', async () => {
    is(await enroll(s3, c1), 201, 200, 409);
    is(await req('POST', `/discussions/${q.id}/replies`, { token: s3.token, body: { body: 'Prueba con node 20' } }), 201);
    eq(is(await req('GET', `/discussions/${q.id}`, { token: s1.token }), 200).body.answered, false);
  });
  await t('El docente responde → answered=true y el estudiante recibe NEW_REPLY', async () => {
    const reply = is(await req('POST', `/discussions/${q.id}/replies`, { token: t1.token, body: { body: 'Actualiza npm y vuelve a intentar' } }), 201).body;
    ctx.reply = reply;
    const d = is(await req('GET', `/discussions/${q.id}`, { token: s1.token }), 200).body;
    eq(d.answered, true);
    ok(d.replies.length === 2 && d.replies.some((r) => r.author.role === 'TEACHER'), 'el hilo no trae la respuesta del docente con su rol');
    ok((await notificationsOf(s1)).items.some((x) => x.type === 'NEW_REPLY'), 'el estudiante no recibió aviso');
  });
  await t('No se responde a una respuesta (400/404)', async () => {
    const r = await req('POST', `/discussions/${ctx.reply.id}/replies`, { token: s1.token, body: { body: 'anidada' } });
    ok([400, 404].includes(r.status), 'permitió anidar: ' + r.status);
  });
  await t('Comentario en una lección y listado por tipo', async () => {
    const c = is(await req('POST', `/lessons/${c1.l1.id}/comments`, { token: s1.token, body: { body: 'Muy buena explicación' } }), 201).body;
    eq(c.kind, 'COMMENT');
    const list = rows(is(await req('GET', `/discussions?kind=COMMENT&courseId=${c1.id}`, { token: s1.token }), 200).body);
    ok(list.some((d) => d.id === c.id));
    ctx.comment = c;
  });
  await t('Solo el autor edita; el docente puede moderar (borrar)', async () => {
    is(await req('PATCH', `/discussions/${ctx.comment.id}`, { token: s3.token, body: { body: 'robado' } }), 403);
    is(await req('PATCH', `/discussions/${ctx.comment.id}`, { token: t1.token, body: { body: 'robado' } }), 403);
    is(await req('PATCH', `/discussions/${ctx.comment.id}`, { token: s1.token, body: { body: 'Muy buena explicación (editado)' } }), 200);
    is(await req('DELETE', `/discussions/${ctx.comment.id}`, { token: t1.token }), 200);
  });
  await t('Borrar la respuesta del docente devuelve la pregunta a "sin responder"', async () => {
    is(await req('DELETE', `/discussions/${ctx.reply.id}`, { token: t1.token }), 200);
    eq(is(await req('GET', `/discussions/${q.id}`, { token: s1.token }), 200).body.answered, false);
  });
  await t('Con P y R desactivado no se hacen preguntas (403) pero sí comentarios', async () => {
    const c = await buildCourse(t1, { title: `SinQA ${ctx.run}`, patch: { qaEnabled: false } });
    is(await enroll(s1, c), 201, 200);
    is(await req('POST', `/courses/${c.id}/questions`, { token: s1.token, body: { title: 'Pregunta bloqueada', body: 'hola' } }), 403);
    is(await req('POST', `/lessons/${c.lessons[0].id}/comments`, { token: s1.token, body: { body: 'comentario sí' } }), 201);
  });
  await t('Texto plano: el HTML de una pregunta no se interpreta (se guarda como texto)', async () => {
    const r = is(await req('POST', `/courses/${c1.id}/questions`, { token: s1.token, body: { title: 'Prueba <b>XSS</b>', body: '<script>alert(1)</script>' } }), 201).body;
    ok(typeof r.body === 'string');
  });
  await t('Borrar la pregunta borra también sus respuestas', async () => {
    is(await req('DELETE', `/discussions/${q.id}`, { token: s1.token }), 200);
    is(await req('GET', `/discussions/${q.id}`, { token: s1.token }), 404);
  });
}
