import { t, section, req, is, ok, eq } from './harness.mjs';
import { buildCourse, enroll, completeAll, rows } from './fixtures.mjs';

export default async function accessEnroll(ctx) {
  const { t1, s1, s2, s3, admin: AD } = ctx;
  const c1 = ctx.c1;
  section('5. Acceso al contenido e inscripciones');

  await t('Sin inscripción: la lección, los recursos, el quiz y la tarea dan 403 NOT_ENROLLED', async () => {
    for (const path of [`/lessons/${c1.l1.id}`, `/modules/${c1.mod1.id}/lessons`, `/lessons/${c1.l1.id}/resources`, `/evaluations/${c1.ev.id}`, `/assignments/${c1.a1.id}`, `/courses/${c1.id}/files`]) {
      const r = is(await req('GET', path, { token: s1.token }), 403);
      if (!path.includes('files')) eq(r.body.locked?.reason, 'NOT_ENROLLED', path + ' → ' + r.text);
    }
  });
  await t('Sin sesión no se abre el contenido (401)', async () => { is(await req('GET', `/lessons/${c1.l1.id}`), 401); });
  await t('El docente y el admin sí abren el contenido (vista previa)', async () => {
    is(await req('GET', `/lessons/${c1.l1.id}`, { token: t1.token }), 200);
    is(await req('GET', `/lessons/${c1.l1.id}`, { token: AD.token }), 200);
  });
  await t('Un docente no puede inscribirse (403)', async () => { is(await enroll(ctx.t2, c1), 403); });
  await t('No se puede inscribir a un curso inexistente (404)', async () => { is(await enroll(s1, { id: 99999999 }), 404); });

  await t('Inscribirse a un curso gratis → 201', async () => {
    const r = is(await enroll(s1, c1), 201, 200);
    ok(r.body);
  });
  await t('Inscribirse de nuevo → 409', async () => { is(await enroll(s1, c1), 409); });
  await t('Mis inscripciones incluye el curso, con su avance', async () => {
    const list = is(await req('GET', '/enrollments/mine', { token: s1.token }), 200).body;
    ok(JSON.stringify(list).includes(`"courseId":${c1.id}`) || JSON.stringify(list).includes(`"id":${c1.id}`), 'no aparece');
  });
  await t('Ya inscrito: abre lecciones, recursos, quiz, tarea y archivos del curso', async () => {
    const lesson = is(await req('GET', `/lessons/${c1.l1.id}`, { token: s1.token }), 200).body;
    ok(/Hola/.test(lesson.content), 'no trae el contenido');
    is(await req('GET', `/lessons/${c1.l1.id}/resources`, { token: s1.token }), 200);
    is(await req('GET', `/evaluations/${c1.ev.id}`, { token: s1.token }), 200);
    is(await req('GET', `/assignments/${c1.a1.id}`, { token: s1.token }), 200);
    const files = is(await req('GET', `/courses/${c1.id}/files`, { token: s1.token }), 200).body;
    ok(files.length >= 1, 'no ve los archivos del curso');
    const dl = is(await req('GET', `/course-files/${files[0].id}/download`, { token: s1.token, raw: true }), 200);
    ok(dl.buf.length > 0);
  });
  await t('Otro estudiante no inscrito no descarga los archivos del curso (404)', async () => {
    const files = is(await req('GET', `/courses/${c1.id}/files`, { token: s1.token }), 200).body;
    is(await req('GET', `/course-files/${files[0].id}/download`, { token: s2.token }), 404, 403);
  });
  await t('El docente ve la lista de inscritos del curso; un estudiante no (403)', async () => {
    const r = is(await req('GET', `/courses/${c1.id}/enrollments`, { token: t1.token }), 200);
    ok(r.text.includes(s1.email) || r.text.includes(`"userId":${s1.id}`) || r.text.includes(`"id":${s1.id}`), 'no aparece el inscrito');
    is(await req('GET', `/courses/${c1.id}/enrollments`, { token: s1.token }), 403);
  });

  section('5b. Avance del estudiante');
  await t('Una lección con video no se completa sin verlo (exige ver el 90 %): 403', async () => {
    is(await req('POST', `/lessons/${c1.l1.id}/complete`, { token: s1.token }), 403);
  });
  await t('Las lecciones siguientes quedan bloqueadas hasta terminar el video anterior (403)', async () => {
    const r = is(await req('POST', `/lessons/${c1.l2.id}/complete`, { token: s1.token }), 403);
    ok(/video anterior/i.test(r.text), r.text);
  });
  await t('Ver el video de verdad (progreso real en el tiempo) permite completar la lección y abre la siguiente', async () => {
    // El servidor mide lo realmente reproducido: máximo ~2x la velocidad entre reportes (anti-trampa).
    const duration = 8;
    for (const position of [0, 4.5, 8]) {
      is(await req('POST', `/lessons/${c1.l1.id}/video-progress`, { token: s1.token, body: { position, duration, playing: true } }), 200, 201);
      await new Promise((x) => setTimeout(x, 2300));
    }
    is(await req('POST', `/lessons/${c1.l1.id}/complete`, { token: s1.token }), 200, 201);
  });
  await t('Saltar el video de un salto (posición al final sin reproducir) NO cuenta como visto', async () => {
    const lesson = c1.lessons[0];
    // s3 no ha visto nada: reporta el final directamente
    is(await enroll(s3, c1), 201, 200, 409);
    is(await req('POST', `/lessons/${lesson.id}/video-progress`, { token: s3.token, body: { position: 8, duration: 8, playing: true } }), 200, 201);
    is(await req('POST', `/lessons/${lesson.id}/complete`, { token: s3.token }), 403);
  });
  await t('Marcar una lección como completada y ver el avance del curso', async () => {
    is(await req('POST', `/lessons/${c1.l2.id}/complete`, { token: s1.token }), 200, 201);
    const p = is(await req('GET', `/courses/${c1.id}/progress`, { token: s1.token }), 200).body;
    ok(JSON.stringify(p).includes(`${c1.l2.id}`), 'la lección no figura como hecha: ' + JSON.stringify(p).slice(0, 200));
  });
  await t('Completar dos veces no duplica (idempotente)', async () => { is(await req('POST', `/lessons/${c1.l2.id}/complete`, { token: s1.token }), 200, 201); });
  await t('Desmarcar una lección', async () => {
    is(await req('DELETE', `/lessons/${c1.l2.id}/complete`, { token: s1.token }), 200);
    is(await req('POST', `/lessons/${c1.l2.id}/complete`, { token: s1.token }), 200, 201);
  });
  await t('Progreso del video: guardar la posición y retomarla', async () => {
    is(await req('POST', `/lessons/${c1.l1.id}/video-progress`, { token: s1.token, body: { position: 6.5, duration: 8, playing: false } }), 200, 201);
    const r = is(await req('GET', `/lessons/${c1.l1.id}/video-progress`, { token: s1.token }), 200).body;
    ok(JSON.stringify(r).includes('6.5'), 'no recuerda la posición: ' + JSON.stringify(r));
  });
  await t('Progreso de video inválido (duración 0 o posición negativa) → 400', async () => {
    is(await req('POST', `/lessons/${c1.l1.id}/video-progress`, { token: s1.token, body: { position: -1, duration: 8, playing: true } }), 400);
    is(await req('POST', `/lessons/${c1.l1.id}/video-progress`, { token: s1.token, body: { position: 1, duration: 0, playing: true } }), 400);
  });
  await t('Racha de estudio (GET /enrollments/streak)', async () => { is(await req('GET', '/enrollments/streak', { token: s1.token }), 200); });
  await t('Un docente o sin sesión no marca avances (403/401)', async () => {
    is(await req('POST', `/lessons/${c1.l2.id}/complete`, { token: t1.token }), 403);
    is(await req('POST', `/lessons/${c1.l2.id}/complete`), 401);
  });
  await t('Un estudiante no inscrito no puede marcar una lección (403)', async () => {
    is(await req('POST', `/lessons/${c1.l2.id}/complete`, { token: s2.token }), 403);
  });

  section('5c. Cancelar y reinscribirse');
  await t('Cancelar la inscripción: se pierde el acceso al contenido; reinscribirse lo devuelve', async () => {
    const other = await buildCourse(t1, { title: `Cancelable ${ctx.run}` });
    is(await enroll(s2, other), 201, 200);
    is(await req('GET', `/lessons/${other.lessons[0].id}`, { token: s2.token }), 200);
    is(await req('DELETE', `/courses/${other.id}/enroll`, { token: s2.token }), 200);
    const r = is(await req('GET', `/lessons/${other.lessons[0].id}`, { token: s2.token }), 403);
    eq(r.body.locked?.reason, 'NOT_ENROLLED');
    is(await enroll(s2, other), 201, 200);
    is(await req('GET', `/lessons/${other.lessons[0].id}`, { token: s2.token }), 200);
  });

  section('5d. Reglas de acceso a un curso');
  await t('Un curso en borrador o archivado no admite inscripciones (404)', async () => {
    const draft = await buildCourse(t1, { title: `Borrador ${ctx.run}`, publish: false });
    is(await enroll(s2, draft), 404, 403);
    const arch = await buildCourse(t1, { title: `Archivado ${ctx.run}` });
    is(await req('PATCH', `/courses/${arch.id}/status`, { token: t1.token, body: { status: 'ARCHIVED' } }), 200);
    is(await enroll(s2, arch), 404, 400, 403);
    const list = rows(is(await req('GET', `/courses?limit=50&search=${encodeURIComponent('Archivado ' + ctx.run)}`), 200).body);
    ok(!list.some((x) => x.id === arch.id), 'un archivado sigue en el catálogo');
  });
  await t('Curso con contraseña: sin ella, con una mala y con la correcta', async () => {
    const c = await buildCourse(t1, { title: `Con clave ${ctx.run}`, patch: { visibility: 'PASSWORD', accessPassword: 'secreto123' } });
    const managed = is(await req('GET', `/courses/manage/${c.id}`, { token: t1.token }), 200).body;
    eq(managed.hasPassword, true);
    ok(!JSON.stringify(managed).includes('secreto123') && !('accessPassword' in managed && managed.accessPassword), 'la contraseña del curso se filtra por la API');
    ok(![200, 201].includes((await enroll(s3, c)).status), 'se inscribió sin la contraseña');
    ok(![200, 201].includes((await enroll(s3, c, { password: 'incorrecta' })).status), 'se inscribió con la contraseña incorrecta');
    is(await enroll(s3, c, { password: 'secreto123' }), 201, 200);
  });
  await t('Curso privado: no sale en el catálogo ni admite inscripción', async () => {
    const c = await buildCourse(t1, { title: `Privado ${ctx.run}`, patch: { visibility: 'PRIVATE' } });
    const list = rows(is(await req('GET', `/courses?limit=50&search=${encodeURIComponent('Privado ' + ctx.run)}`), 200).body);
    ok(!list.some((x) => x.id === c.id), 'un curso privado salió en el catálogo');
    ok(![200, 201].includes((await enroll(s3, c)).status), 'se inscribió a un curso privado');
  });
  await t('Cupo máximo: el último cupo se llena y el siguiente es rechazado', async () => {
    const c = await buildCourse(t1, { title: `Cupo ${ctx.run}`, patch: { maxStudents: 1 } });
    is(await enroll(s1, c), 201, 200);
    const r = await enroll(s2, c);
    ok([400, 403, 409].includes(r.status), 'aceptó más inscritos que el cupo: ' + r.status + ' ' + r.text);
  });
  await t('Cursos recomendados (prerrequisitos): se guardan y se muestran, pero NO bloquean la inscripción (decisión de diseño)', async () => {
    const pre = await buildCourse(t1, { title: `Recomendado ${ctx.run}`, lessons: 1 });
    const main = await buildCourse(t1, { title: `Avanzado ${ctx.run}`, patch: { prerequisiteIds: [pre.id] } });
    const managed = is(await req('GET', `/courses/manage/${main.id}`, { token: t1.token }), 200).body;
    eq(managed.prerequisites[0].id, pre.id);
    is(await enroll(s3, main), 201, 200, 409);
  });
  await t('Contenido público: sin inscribirse se puede leer cuando el curso lo permite', async () => {
    const c = await buildCourse(t1, { title: `Abierto ${ctx.run}`, patch: { publicContent: true } });
    is(await req('GET', `/lessons/${c.lessons[0].id}`, { token: s2.token }), 200);
    const closed = await buildCourse(t1, { title: `Cerrado ${ctx.run}`, patch: { publicContent: false } });
    is(await req('GET', `/lessons/${closed.lessons[0].id}`, { token: s2.token }), 403);
  });

  section('5e. Liberación gradual de módulos');
  await t('SEQUENTIAL: el 2.º módulo está bloqueado hasta terminar el 1.º', async () => {
    const c = await buildCourse(t1, { title: `Secuencial ${ctx.run}`, modules: 2, lessons: 1, patch: { dripType: 'SEQUENTIAL' } });
    is(await enroll(s2, c), 201, 200);
    const av = is(await req('GET', `/courses/${c.id}/modules/availability`, { token: s2.token }), 200).body;
    eq(av.dripType, 'SEQUENTIAL');
    eq(av.modules[0].locked, false);
    eq(av.modules[1].locked, true);
    eq(av.modules[1].reason, 'PREVIOUS');
    const blocked = is(await req('GET', `/lessons/${c.modules[1].lessons[0].id}`, { token: s2.token }), 403);
    eq(blocked.body.locked.reason, 'PREVIOUS');
    is(await req('POST', `/lessons/${c.modules[0].lessons[0].id}/complete`, { token: s2.token }), 200, 201);
    const after = is(await req('GET', `/courses/${c.id}/modules/availability`, { token: s2.token }), 200).body;
    eq(after.modules[1].locked, false, 'terminar el módulo 1 no abrió el 2');
    is(await req('GET', `/lessons/${c.modules[1].lessons[0].id}`, { token: s2.token }), 200);
    // el docente lo ve todo abierto
    const teacherView = is(await req('GET', `/courses/${c.id}/modules/availability`, { token: t1.token }), 200).body;
    ok(teacherView.modules.every((m) => !m.locked), 'el docente ve candados');
  });
  await t('BY_DATE: un módulo con fecha futura queda bloqueado con reason DATE', async () => {
    const c = await buildCourse(t1, { title: `Por fecha ${ctx.run}`, modules: 2, lessons: 1, patch: { dripType: 'BY_DATE' } });
    is(await req('PATCH', `/modules/${c.modules[1].id}`, { token: t1.token, body: { unlockAt: new Date(Date.now() + 30 * 864e5).toISOString() } }), 200);
    is(await enroll(s3, c), 201, 200);
    const r = is(await req('GET', `/lessons/${c.modules[1].lessons[0].id}`, { token: s3.token }), 403);
    eq(r.body.locked.reason, 'DATE');
    ok(r.body.locked.unlocksAt, 'falta unlocksAt');
  });
  await t('AFTER_DAYS: se abre N días después de inscribirse (reason DAYS)', async () => {
    const c = await buildCourse(t1, { title: `Por días ${ctx.run}`, modules: 2, lessons: 1, patch: { dripType: 'AFTER_DAYS' } });
    is(await req('PATCH', `/modules/${c.modules[1].id}`, { token: t1.token, body: { unlockAfterDays: 7 } }), 200);
    is(await enroll(s1, c), 201, 200);
    const r = is(await req('GET', `/lessons/${c.modules[1].lessons[0].id}`, { token: s1.token }), 403);
    eq(r.body.locked.reason, 'DAYS');
  });
  await t('PREREQUISITES: un círculo (A pide B y B pide A) se rechaza con 400', async () => {
    const c = await buildCourse(t1, { title: `Prereq ${ctx.run}`, modules: 2, lessons: 1, patch: { dripType: 'PREREQUISITES' } });
    is(await req('PATCH', `/modules/${c.modules[0].id}`, { token: t1.token, body: { requiresModuleIds: [c.modules[1].id] } }), 200);
    is(await req('PATCH', `/modules/${c.modules[1].id}`, { token: t1.token, body: { requiresModuleIds: [c.modules[0].id] } }), 400);
    is(await req('PATCH', `/modules/${c.modules[0].id}`, { token: t1.token, body: { requiresModuleIds: [c.modules[0].id] } }), 400);
  });
}
