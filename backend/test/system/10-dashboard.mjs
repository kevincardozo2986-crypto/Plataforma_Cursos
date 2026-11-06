import { t, section, req, is, ok, eq } from './harness.mjs';
import { buildCourse, enroll, completeAll, notificationsOf } from './fixtures.mjs';

export default async function dashboard(ctx) {
  const { t1, t2, s1, s2, s3, admin: AD } = ctx;
  const c1 = ctx.c1;
  section('11. Dashboard del docente');

  await t('Un estudiante no entra al dashboard (403); sin sesión 401', async () => {
    is(await req('GET', '/dashboard/teacher', { token: s1.token }), 403);
    is(await req('GET', '/dashboard/teacher'), 401);
  });
  for (const [period, bucket] of [['7d', 'day'], ['30d', 'week'], ['90d', 'week'], ['1y', 'month'], ['all', 'month']]) {
    await t(`Métricas con periodo ${period}: agrupa por ${bucket}, con series completas`, async () => {
      const r = is(await req('GET', `/dashboard/teacher?period=${period}`, { token: t1.token }), 200).body;
      eq(r.bucket, bucket);
      ok(r.series.every((p) => 'enrollments' in p && 'completions' in p && p.date));
      ok(r.completion.enrolled >= r.completion.completed);
      eq(r.completion.enrolled, r.completion.completed + r.completion.inProgress + r.completion.inactive + r.completion.cancelled, 'los estados no suman las inscripciones');
    });
  }
  await t('Periodo inválido → 400', async () => { is(await req('GET', '/dashboard/teacher?period=siempre', { token: t1.token }), 400); });
  await t('"previous" solo en periodos finitos y sin filtro de curso', async () => {
    ok((is(await req('GET', '/dashboard/teacher?period=30d', { token: t1.token }), 200).body).previous);
    eq(is(await req('GET', '/dashboard/teacher?period=all', { token: t1.token }), 200).body.previous, null);
    eq(is(await req('GET', `/dashboard/teacher?period=30d&courseId=${c1.id}`, { token: t1.token }), 200).body.previous, null);
  });
  await t('Con courseId solo cuenta ese curso; un curso ajeno → 403', async () => {
    const r = is(await req('GET', `/dashboard/teacher?period=all&courseId=${c1.id}`, { token: t1.token }), 200).body;
    eq(r.courseBreakdown.length, 1);
    is(await req('GET', `/dashboard/teacher?courseId=${c1.id}`, { token: t2.token }), 403);
  });
  await t('Cada docente ve solo lo suyo; el admin ve todo', async () => {
    const mine = is(await req('GET', '/dashboard/teacher?period=all', { token: t2.token }), 200).body;
    ok(!mine.courseBreakdown.some((c) => c.id === c1.id), 've cursos de otro docente');
    const all = is(await req('GET', '/dashboard/teacher?period=all', { token: AD.token }), 200).body;
    ok(all.courseBreakdown.some((c) => c.id === c1.id));
  });
  await t('Los quizzes/tareas pendientes de revisión se cuentan', async () => {
    const r = is(await req('GET', '/dashboard/teacher?period=all', { token: t1.token }), 200).body;
    ok(typeof r.quizzes.pendingReview === 'number' && typeof r.assignments.pendingGrading === 'number');
  });

  section('11b. Inscritos y recordatorios');
  let list;
  await t('Lista de estudiantes con avance, estado y semanas; filtros por estado y búsqueda', async () => {
    list = is(await req('GET', `/dashboard/teacher/students?period=all&courseId=${c1.id}&limit=50`, { token: t1.token }), 200).body;
    ok(list.total >= 2 && list.items.every((r) => r.progress && Array.isArray(r.weeks) && r.weeks.length === 8), 'forma rara');
    const found = is(await req('GET', `/dashboard/teacher/students?period=all&q=${encodeURIComponent(s3.email)}`, { token: t1.token }), 200).body;
    ok(found.items.some((r) => r.student.email === s3.email), 'la búsqueda no encuentra');
    const done = is(await req('GET', '/dashboard/teacher/students?period=all&state=COMPLETED&limit=100', { token: t1.token }), 200).body;
    ok(done.items.every((r) => r.state === 'COMPLETED'));
  });
  await t('Detalle de una inscripción: lecciones, semanas y línea de tiempo', async () => {
    const row = list.items.find((r) => r.student.email === s1.email);
    const d = is(await req('GET', `/dashboard/teacher/students/${row.enrollmentId}`, { token: t1.token }), 200).body;
    ok(d.lessons.length >= 3 && d.weeks.length === 8 && d.events.some((e) => e.kind), 'detalle incompleto');
    is(await req('GET', `/dashboard/teacher/students/${row.enrollmentId}`, { token: t2.token }), 403);
    is(await req('GET', '/dashboard/teacher/students/99999999', { token: t1.token }), 404);
  });
  await t('Recordatorio: 201 al estudiante activo, 409 el mismo día, 400 a quien ya terminó, 403 a docente ajeno', async () => {
    const active = list.items.find((r) => r.student.email === s3.email);
    const r = is(await req('POST', `/dashboard/teacher/students/${active.enrollmentId}/remind`, { token: t1.token }), 200, 201);
    eq(r.body.sent, true);
    ok((await notificationsOf(s3)).items.some((n) => n.type === 'COURSE_REMINDER'), 'el estudiante no recibió el recordatorio');
    is(await req('POST', `/dashboard/teacher/students/${active.enrollmentId}/remind`, { token: t1.token }), 409);
    is(await req('POST', `/dashboard/teacher/students/${active.enrollmentId}/remind`, { token: t2.token }), 403);
    is(await req('POST', `/dashboard/teacher/students/${active.enrollmentId}/remind`, { token: s1.token }), 403);
    const done = is(await req('GET', '/dashboard/teacher/students?period=all&state=COMPLETED&limit=100', { token: t1.token }), 200).body.items[0];
    if (done) is(await req('POST', `/dashboard/teacher/students/${done.enrollmentId}/remind`, { token: t1.token }), 400);
  });
  await t('Reseñas del dashboard: reparto por estrellas', async () => {
    const r = is(await req('GET', `/dashboard/teacher/ratings?period=all&courseId=${c1.id}`, { token: t1.token }), 200).body;
    ok(r.distribution.length === 5 && typeof r.count === 'number');
  });
  await t('Pedir reseñas a quienes terminaron: avisa una sola vez; un docente ajeno 403', async () => {
    const c = await buildCourse(t1, { title: `Pedir reseñas ${ctx.run}`, lessons: 1 });
    is(await enroll(s2, c), 201, 200);
    await completeAll(s2, c);
    const a = is(await req('POST', `/dashboard/teacher/request-reviews?courseId=${c.id}`, { token: t1.token }), 200, 201).body;
    eq(a.sent, 1);
    const b = is(await req('POST', `/dashboard/teacher/request-reviews?courseId=${c.id}`, { token: t1.token }), 200, 201).body;
    eq(b.sent, 0);
    eq(b.eligible, 1);
    ok((await notificationsOf(s2)).items.some((n) => /reseña/i.test(n.message)), 'el estudiante no recibió la invitación');
    is(await req('POST', `/dashboard/teacher/request-reviews?courseId=${c.id}`, { token: t2.token }), 403);
    is(await req('POST', `/dashboard/teacher/request-reviews?courseId=${c.id}`, { token: s2.token }), 403);
  });
}
