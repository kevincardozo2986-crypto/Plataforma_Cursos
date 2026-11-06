import { t, section, req, is, ok, eq, upload } from './harness.mjs';
import { notificationsOf } from './fixtures.mjs';

export default async function assessments(ctx) {
  const { t1, s1, s2, s3 } = ctx;
  const c1 = ctx.c1;
  section('6. Quizzes');

  let questions;
  await t('El estudiante ve el quiz SIN las respuestas correctas', async () => {
    const r = is(await req('GET', `/evaluations/${c1.ev.id}`, { token: s1.token }), 200);
    ok(!/"isCorrect"/.test(r.text) && !/acceptedAnswers/.test(r.text), 'se filtran las respuestas correctas al estudiante');
    questions = r.body.questions;
    eq(questions.length, 4);
  });
  await t('El docente sí ve cuáles son las correctas', async () => {
    const r = is(await req('GET', `/evaluations/${c1.ev.id}`, { token: t1.token }), 200);
    ok(/"isCorrect":true/.test(r.text));
  });
  const teacherQ = async () => is(await req('GET', `/evaluations/${c1.ev.id}`, { token: t1.token }), 200).body.questions;
  const answersFor = (tq, mode) => tq.map((q) => {
    const correct = (q.options ?? []).filter((o) => o.isCorrect).map((o) => o.id);
    const wrong = (q.options ?? []).filter((o) => !o.isCorrect).map((o) => o.id);
    if (q.type === 'FILL_BLANK') return { questionId: q.id, text: mode === 'good' ? '  PARIS ' : 'londres' };
    return { questionId: q.id, optionIds: mode === 'good' ? correct : wrong.slice(0, 1) };
  });
  await t('Intento con todo correcto (incluye "  PARIS " sin tildes ni mayúsculas) → 100 y aprobado', async () => {
    const r = is(await req('POST', `/evaluations/${c1.ev.id}/attempts`, { token: s1.token, body: { answers: answersFor(await teacherQ(), 'good') } }), 201, 200).body;
    eq(r.status, 'GRADED');
    eq(r.score, 100);
    eq(r.passed, true);
    ok(!JSON.stringify(r.results).includes('isCorrect'), 'revela la respuesta correcta');
  });
  await t('Intento con todo mal → reprobado', async () => {
    const r = is(await req('POST', `/evaluations/${c1.ev.id}/attempts`, { token: s1.token, body: { answers: answersFor(await teacherQ(), 'bad') } }), 201, 200).body;
    eq(r.passed, false);
  });
  await t('Mis intentos se listan', async () => {
    const r = is(await req('GET', `/evaluations/${c1.ev.id}/attempts/mine`, { token: s1.token }), 200).body;
    ok(r.length >= 2, 'faltan intentos');
  });
  await t('Responder la misma pregunta dos veces → 400', async () => {
    const tq = await teacherQ();
    const a = answersFor(tq, 'good');
    is(await req('POST', `/evaluations/${c1.ev.id}/attempts`, { token: s1.token, body: { answers: [a[0], a[0]] } }), 400);
  });
  await t('Un estudiante no inscrito no presenta el quiz (403) y un docente tampoco', async () => {
    const body = { answers: [{ questionId: questions[0].id, optionIds: [questions[0].options[0].id] }] };
    is(await req('POST', `/evaluations/${c1.ev.id}/attempts`, { token: s2.token, body }), 403);
    is(await req('POST', `/evaluations/${c1.ev.id}/attempts`, { token: t1.token, body }), 403);
  });

  section('6b. Quiz con pregunta abierta y revisión del docente');
  const essayQs = async () => is(await req('GET', `/evaluations/${c1.essay.id}`, { token: t1.token }), 200).body.questions;
  let attemptId;
  await t('Pregunta abierta → el intento queda PENDING_REVIEW (provisional, no aprobado)', async () => {
    // el módulo 2 no pide nada previo en este curso
    const qs = await essayQs();
    const single = qs.find((q) => q.type === 'SINGLE'), essay = qs.find((q) => q.type === 'ESSAY');
    const r = is(await req('POST', `/evaluations/${c1.essay.id}/attempts`, { token: s1.token, body: { answers: [{ questionId: single.id, optionIds: [single.options.find((o) => o.isCorrect).id] }, { questionId: essay.id, text: 'Es una interfaz entre sistemas.' }] } }), 201, 200).body;
    eq(r.status, 'PENDING_REVIEW');
    eq(r.passed, false);
    attemptId = r.id;
    ctx.essay = { single, essay };
  });
  await t('Respuesta abierta en blanco → 400', async () => {
    const { essay } = ctx.essay;
    is(await req('POST', `/evaluations/${c1.essay.id}/attempts`, { token: s1.token, body: { answers: [{ questionId: essay.id, text: '   ' }] } }), 400);
  });
  await t('Bandeja del docente: lista los pendientes y filtra por estado', async () => {
    const r = is(await req('GET', '/evaluation-attempts?status=PENDING_REVIEW', { token: t1.token }), 200).body;
    ok(r.items.some((a) => a.id === attemptId), 'no aparece el pendiente');
    ok(r.items.every((a) => a.status === 'PENDING_REVIEW'));
  });
  await t('Detalle del intento (solo docente) con lo escrito por el estudiante', async () => {
    const r = is(await req('GET', `/evaluation-attempts/${attemptId}`, { token: t1.token }), 200).body;
    ok(JSON.stringify(r.questions).includes('Es una interfaz'));
    is(await req('GET', `/evaluation-attempts/${attemptId}`, { token: s1.token }), 403);
  });
  await t('Calificar: puntos fuera de rango → 400; válidos → GRADED y aviso GRADED_QUIZ al estudiante', async () => {
    const { essay } = ctx.essay;
    is(await req('PATCH', `/evaluation-attempts/${attemptId}/grade`, { token: t1.token, body: { grades: [{ questionId: essay.id, points: 99 }] } }), 400);
    const r = is(await req('PATCH', `/evaluation-attempts/${attemptId}/grade`, { token: t1.token, body: { grades: [{ questionId: essay.id, points: 3, comment: 'Falta HTTP' }], feedback: 'Buen trabajo' } }), 200).body;
    eq(r.status, 'GRADED');
    ok(r.score > 0);
    const n = await notificationsOf(s1);
    ok(n.items.some((x) => x.type === 'GRADED_QUIZ'), 'no hay aviso GRADED_QUIZ');
    const mine = is(await req('GET', `/evaluations/${c1.essay.id}/attempts/mine`, { token: s1.token }), 200).body;
    ok(JSON.stringify(mine).includes('Falta HTTP') && JSON.stringify(mine).includes('Buen trabajo'), 'el estudiante no ve el comentario');
  });
  await t('Un estudiante no califica (403); otro docente no ve este intento', async () => {
    is(await req('PATCH', `/evaluation-attempts/${attemptId}/grade`, { token: s1.token, body: { grades: [] } }), 403);
    is(await req('GET', `/evaluation-attempts/${attemptId}`, { token: ctx.t2.token }), 403, 404);
  });
  await t('Editar el quiz (reemplaza preguntas) no rompe la revisión de intentos ya hechos', async () => {
    is(await req('PATCH', `/evaluations/${c1.essay.id}`, { token: t1.token, body: { title: 'Quiz abierto v2' } }), 200);
    is(await req('GET', `/evaluation-attempts/${attemptId}`, { token: t1.token }), 200);
  });

  section('6c. Tareas');
  let sub, up;
  await t('El estudiante ve la tarea con el adjunto del docente y su estado (mySubmission null)', async () => {
    const list = is(await req('GET', `/modules/${c1.mod1.id}/assignments`, { token: s1.token }), 200).body;
    const a = list.find((x) => x.id === c1.a1.id);
    ok(a && a.mySubmission === null && 'submissionCount' in a);
    const full = is(await req('GET', `/assignments/${c1.a1.id}`, { token: s1.token }), 200).body;
    const file = full.attachments[0];
    const dl = is(await req('GET', file.url.replace('/api', ''), { token: s1.token, raw: true }), 200);
    eq(dl.buf.toString(), 'Plantilla de entrega');
  });
  await t('Entregar con texto y un archivo propio', async () => {
    up = is(await upload('documents', s1.token, 'Mi informe', 'informe.txt', 'text/plain'), 201).body;
    sub = is(await req('PUT', `/assignments/${c1.a1.id}/submission`, { token: s1.token, body: { text: 'Aquí está', files: [{ name: up.name }] } }), 200, 201).body;
    eq(sub.status, 'SUBMITTED');
    eq(sub.late, false);
  });
  await t('Entrega vacía (sin texto ni archivos) → 400', async () => {
    is(await req('PUT', `/assignments/${c1.a1.id}/submission`, { token: s1.token, body: {} }), 400);
  });
  await t('No se puede adjuntar un archivo subido por otra persona (400)', async () => {
    const other = is(await upload('documents', s3.token, 'ajeno', 'ajeno.txt', 'text/plain'), 201).body;
    is(await req('PUT', `/assignments/${c1.a1.id}/submission`, { token: s1.token, body: { files: [{ name: other.name }] } }), 400);
  });
  await t('Reenviar mientras no esté calificada reemplaza la entrega', async () => {
    const r = is(await req('PUT', `/assignments/${c1.a1.id}/submission`, { token: s1.token, body: { text: 'Versión 2', files: [{ name: up.name }] } }), 200, 201).body;
    eq(r.text, 'Versión 2');
    eq(is(await req('GET', `/assignments/${c1.a1.id}/submission/mine`, { token: s1.token }), 200).body.text, 'Versión 2');
  });
  await t('Sin entrega previa, submission/mine → 404', async () => { is(await req('GET', `/assignments/${c1.a1.id}/submission/mine`, { token: s3.token }), 404, 403); });
  await t('Tarea vencida sin entregas tardías → 400', async () => {
    const r = is(await req('PUT', `/assignments/${c1.a2.id}/submission`, { token: s1.token, body: { text: 'tarde' } }), 400);
    ok(/fecha|plazo|vencid/i.test(r.text), r.text);
  });
  await t('Tarea vencida CON entregas tardías → se acepta y queda late=true', async () => {
    is(await req('PATCH', `/assignments/${c1.a2.id}`, { token: t1.token, body: { allowLate: true } }), 200);
    const r = is(await req('PUT', `/assignments/${c1.a2.id}/submission`, { token: s1.token, body: { text: 'tarde pero a tiempo' } }), 200, 201).body;
    eq(r.late, true);
  });
  let subId;
  await t('Bandeja del docente: entregas pendientes y detalle con archivos', async () => {
    const r = is(await req('GET', `/assignment-submissions?assignmentId=${c1.a1.id}&status=SUBMITTED`, { token: t1.token }), 200).body;
    ok(r.items.length === 1);
    subId = r.items[0].id;
    const d = is(await req('GET', `/assignment-submissions/${subId}`, { token: t1.token }), 200).body;
    ok(d.files.length === 1 && d.text === 'Versión 2');
    const dl = is(await req('GET', d.files[0].url.replace('/api', ''), { token: t1.token, raw: true }), 200);
    eq(dl.buf.toString(), 'Mi informe');
  });
  await t('Otra persona no descarga la entrega (404)', async () => {
    is(await req('GET', `/submission-files/${up.name}`, { token: s3.token }), 404);
    is(await req('GET', `/submission-files/${up.name}`, { token: ctx.t2.token }), 404);
  });
  await t('Calificar: fuera de rango → 400; válida → GRADED con aviso GRADED_ASSIGNMENT', async () => {
    is(await req('PATCH', `/assignment-submissions/${subId}/grade`, { token: t1.token, body: { score: 101 } }), 400);
    const r = is(await req('PATCH', `/assignment-submissions/${subId}/grade`, { token: t1.token, body: { score: 85, feedback: 'Falta citar fuentes' } }), 200).body;
    eq(r.status, 'GRADED');
    const n = await notificationsOf(s1);
    ok(n.items.some((x) => x.type === 'GRADED_ASSIGNMENT' && /85/.test(x.title)), 'no hay aviso con la nota');
  });
  await t('Una entrega calificada ya no se puede cambiar (400)', async () => {
    is(await req('PUT', `/assignments/${c1.a1.id}/submission`, { token: s1.token, body: { text: 'cambio' } }), 400);
  });
  await t('Se puede corregir la nota', async () => {
    const r = is(await req('PATCH', `/assignment-submissions/${subId}/grade`, { token: t1.token, body: { score: 90 } }), 200).body;
    eq(r.score, 90);
  });
  await t('El estudiante ve su nota en la lista del módulo (mySubmission)', async () => {
    const list = is(await req('GET', `/modules/${c1.mod1.id}/assignments`, { token: s1.token }), 200).body;
    eq(list.find((x) => x.id === c1.a1.id).mySubmission.status, 'GRADED');
  });
  await t('Un estudiante no ve la bandeja de entregas (403)', async () => { is(await req('GET', '/assignment-submissions', { token: s1.token }), 403); });
  await t('No se baja el puntaje máximo por debajo de una nota puesta (400)', async () => {
    is(await req('PATCH', `/assignments/${c1.a1.id}`, { token: t1.token, body: { maxScore: 50 } }), 400);
  });
}
