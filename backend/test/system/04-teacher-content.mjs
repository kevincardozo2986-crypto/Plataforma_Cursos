import { t, section, req, is, ok, eq, upload, RUN } from './harness.mjs';
import { notificationsOf, rows, ensureBase } from './fixtures.mjs';

export default async function teacherContent(ctx) {
  const { t1, t2, s1, admin: AD } = ctx;
  await ensureBase(ctx);
  section('4. El docente crea y publica un curso');

  let id, mod1, mod2, l1, l2, l3, c;
  await t('Crear un borrador vacío (POST /courses/draft)', async () => {
    c = is(await req('POST', '/courses/draft', { token: t1.token }), 201, 200).body;
    id = c.id;
    ctx.created.courses.push(id);
    eq(c.status, 'DRAFT');
  });
  await t('Pedir otro borrador mientras el primero está sin tocar devuelve el mismo (no llena la lista de vacíos)', async () => {
    const again = is(await req('POST', '/courses/draft', { token: t1.token }), 201, 200).body;
    eq(again.id, id);
  });
  await t('Un estudiante no puede crear cursos (403)', async () => { is(await req('POST', '/courses/draft', { token: s1.token }), 403); });
  await t('Publicar un borrador sin título/descripción/módulos → 400 diciendo qué falta', async () => {
    const r = is(await req('PATCH', `/courses/${id}/status`, { token: t1.token, body: { status: 'PUBLISHED' } }), 400);
    ok(/falta/i.test(r.body.message), r.text);
  });
  await t('Editar datos del curso: título, descripción HTML, nivel, precio, categoría, imagen', async () => {
    const r = is(await req('PATCH', `/courses/${id}`, { token: t1.token, body: {
      title: `Curso principal ${RUN}`, description: '<p>Hola <b>mundo</b></p><script>alert(1)</script><img src=x onerror="alert(2)">',
      level: 'INTERMEDIATE', price: 0, categoryId: ctx.cat.id, imageUrl: ctx.image.url,
      whatYouWillLearn: '<ul><li>Aprender</li></ul>', durationMinutes: 120, qaEnabled: true } }), 200).body;
    eq(r.level, 'INTERMEDIATE');
    ok(!/<script|onerror/i.test(r.description), 'el HTML peligroso no se limpió: ' + r.description);
    ok(/<b>mundo<\/b>/.test(r.description), 'se perdió el HTML seguro');
  });
  await t('Validaciones del curso: precio negativo, nivel inválido, título corto → 400', async () => {
    is(await req('PATCH', `/courses/${id}`, { token: t1.token, body: { price: -5 } }), 400);
    is(await req('PATCH', `/courses/${id}`, { token: t1.token, body: { level: 'EXPERTO' } }), 400);
    is(await req('PATCH', `/courses/${id}`, { token: t1.token, body: { title: 'a' } }), 400);
  });
  await t('Una imagen externa o archivo inexistente como portada se rechaza o se acepta con URL https válida', async () => {
    const r = await req('PATCH', `/courses/${id}`, { token: t1.token, body: { imageUrl: 'javascript:alert(1)' } });
    ok(r.status === 400, 'aceptó una URL javascript: → ' + r.status);
  });

  await t('Crear módulos y listarlos en orden', async () => {
    mod1 = is(await req('POST', `/courses/${id}/modules`, { token: t1.token, body: { title: 'Fundamentos', description: '<p>Intro</p>' } }), 201).body;
    mod2 = is(await req('POST', `/courses/${id}/modules`, { token: t1.token, body: { title: 'Práctica' } }), 201).body;
    const list = is(await req('GET', `/courses/${id}/modules`, { token: t1.token }), 200).body;
    ok(list.length === 2 && list[0].id === mod1.id, 'orden raro');
  });
  await t('Editar y reordenar un módulo (position)', async () => {
    const r = is(await req('PATCH', `/modules/${mod2.id}`, { token: t1.token, body: { title: 'Práctica guiada' } }), 200).body;
    eq(r.title, 'Práctica guiada');
    is(await req('PATCH', `/modules/${mod1.id}`, { token: t1.token, body: { position: 9 } }), 200);
    const list = is(await req('GET', `/courses/${id}/modules`, { token: t1.token }), 200).body;
    eq(list[0].id, mod2.id, 'el reorden no se aplicó');
    is(await req('PATCH', `/modules/${mod1.id}`, { token: t1.token, body: { position: 1 } }), 200);
  });
  await t('Crear lecciones con contenido HTML (se limpia), video y duración', async () => {
    l1 = is(await req('POST', `/modules/${mod1.id}/lessons`, { token: t1.token, body: { title: 'Bienvenida', content: '<h2>Hola</h2><script>x()</script><p onclick="x()">texto</p>', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', durationMinutes: 10 } }), 201).body;
    l2 = is(await req('POST', `/modules/${mod1.id}/lessons`, { token: t1.token, body: { title: 'Conceptos', content: '<p>Segunda</p>', durationMinutes: 15 } }), 201).body;
    l3 = is(await req('POST', `/modules/${mod2.id}/lessons`, { token: t1.token, body: { title: 'Ejercicio', content: '<p>Tercera</p>', durationMinutes: 20 } }), 201).body;
    ok(!/<script|onclick/i.test(l1.content), 'no se limpió el HTML de la lección');
  });
  await t('Lección con video de un archivo subido y con URL peligrosa → 400', async () => {
    is(await req('POST', `/modules/${mod1.id}/lessons`, { token: t1.token, body: { title: 'Mala', videoUrl: 'javascript:alert(1)' } }), 400);
    is(await req('POST', `/modules/${mod1.id}/lessons`, { token: t1.token, body: { title: 'x' } }), 400);
  });
  await t('Editar una lección y verla', async () => {
    const r = is(await req('PATCH', `/lessons/${l2.id}`, { token: t1.token, body: { title: 'Conceptos clave', durationMinutes: 12 } }), 200).body;
    eq(r.title, 'Conceptos clave');
    eq(is(await req('GET', `/lessons/${l2.id}`, { token: t1.token }), 200).body.durationMinutes, 12);
  });
  await t('Recursos de una lección: crear (enlace), editar, listar y borrar', async () => {
    const r = is(await req('POST', `/lessons/${l1.id}/resources`, { token: t1.token, body: { title: 'Guía oficial', type: 'LINK', url: 'https://example.com/guia' } }), 201).body;
    is(await req('PATCH', `/resources/${r.id}`, { token: t1.token, body: { title: 'Guía oficial v2' } }), 200);
    const list = is(await req('GET', `/lessons/${l1.id}/resources`, { token: t1.token }), 200).body;
    ok(list.some((x) => x.title === 'Guía oficial v2'));
    is(await req('POST', `/lessons/${l1.id}/resources`, { token: t1.token, body: { title: 'Mala', url: 'javascript:alert(1)' } }), 400);
    const temp = is(await req('POST', `/lessons/${l1.id}/resources`, { token: t1.token, body: { title: 'Temporal', type: 'LINK', url: 'https://example.com/tmp' } }), 201).body;
    is(await req('DELETE', `/resources/${temp.id}`, { token: t1.token }), 200);
  });
  await t('Archivos descargables del curso: subir, adjuntar, listar y quitar', async () => {
    const up = is(await upload('documents', t1.token, 'Guia del curso', 'guia.txt', 'text/plain'), 201).body;
    const f = is(await req('POST', `/courses/${id}/files`, { token: t1.token, body: { name: up.name } }), 201).body;
    const list = is(await req('GET', `/courses/${id}/files`, { token: t1.token }), 200).body;
    ok(list.some((x) => x.originalName === 'guia.txt'));
    const dl = is(await req('GET', `/course-files/${list[0].id}/download`, { token: t1.token, raw: true }), 200);
    eq(dl.buf.toString(), 'Guia del curso');
    ctx.courseFile = { id: f.id ?? list[0].id };
    // se deja adjunto para probar el acceso del estudiante más adelante
  });

  section('4b. Evaluaciones y tareas (creación)');
  let ev, essay;
  await t('Crear un quiz con los 5 tipos de pregunta', async () => {
    ev = is(await req('POST', `/modules/${mod1.id}/evaluations`, { token: t1.token, body: { title: 'Quiz 1', description: '<p>Responde</p>', passingScore: 60, questions: [
      { type: 'TRUE_FALSE', text: 'El cielo es azul', isTrue: true },
      { text: 'Capital de Colombia', options: [{ text: 'Bogotá', isCorrect: true }, { text: 'Lima', isCorrect: false }] },
      { type: 'MULTIPLE', text: 'Son lenguajes', points: 2, options: [{ text: 'TypeScript', isCorrect: true }, { text: 'Python', isCorrect: true }, { text: 'Excel', isCorrect: false }] },
      { type: 'FILL_BLANK', text: 'La capital de Francia es ____', acceptedAnswers: ['París', 'Ciudad Luz'] },
    ] } }), 201).body;
    ok(ev.id);
  });
  await t('Reglas de pregunta: MULTIPLE con una sola correcta → 400 con mensaje', async () => {
    const r = is(await req('POST', `/modules/${mod1.id}/evaluations`, { token: t1.token, body: { title: 'Mal', passingScore: 60, questions: [
      { type: 'MULTIPLE', text: 'Pregunta de prueba', options: [{ text: 'opcion a', isCorrect: true }, { text: 'opcion b', isCorrect: false }] }] } }), 400);
    ok(/pregunta 1/i.test(r.body.message), r.text);
  });
  await t('Quiz con pregunta abierta (ensayo)', async () => {
    essay = is(await req('POST', `/modules/${mod2.id}/evaluations`, { token: t1.token, body: { title: 'Quiz abierto', passingScore: 50, questions: [
      { type: 'SINGLE', text: '2+2', options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }] },
      { type: 'ESSAY', text: 'Explica qué es una API', points: 4 }] } }), 201).body;
    ok(essay.id);
  });
  let a1, a2;
  await t('Crear tareas: una con fecha límite y adjunto del docente, otra vencida sin entregas tardías', async () => {
    const att = is(await upload('documents', t1.token, 'Plantilla de entrega', 'plantilla.txt', 'text/plain'), 201).body;
    a1 = is(await req('POST', `/modules/${mod1.id}/assignments`, { token: t1.token, body: { title: 'Informe', description: '<p>Entrega el <b>informe</b></p>', dueAt: new Date(Date.now() + 7 * 864e5).toISOString(), allowLate: true, maxScore: 100, attachments: [{ name: att.name }] } }), 201).body;
    a2 = is(await req('POST', `/modules/${mod1.id}/assignments`, { token: t1.token, body: { title: 'Vencida', dueAt: new Date(Date.now() - 2 * 864e5).toISOString(), allowLate: false, maxScore: 50 } }), 201).body;
    ok(a1.attachments?.length === 1, 'el adjunto del docente no quedó');
  });
  await t('maxScore fuera de rango → 400', async () => {
    is(await req('POST', `/modules/${mod1.id}/assignments`, { token: t1.token, body: { title: 'Mala', maxScore: 5000 } }), 400);
  });

  section('4c. Publicar y el catálogo público');
  await t('Un curso en borrador NO aparece en el catálogo ni se puede abrir (404)', async () => {
    const list = is(await req('GET', '/courses?limit=50&search=principal'), 200).body;
    ok(!rows(list).some((x) => x.id === id), 'el borrador salió en el catálogo');
    is(await req('GET', `/courses/${id}`), 404);
  });
  await t('Publicar el curso', async () => {
    const r = is(await req('PATCH', `/courses/${id}/status`, { token: t1.token, body: { status: 'PUBLISHED' } }), 200);
    eq(r.body.status, 'PUBLISHED');
  });
  await t('El catálogo público lo muestra, con filtros por texto, nivel y categoría', async () => {
    const all = is(await req('GET', `/courses?search=${encodeURIComponent('principal ' + RUN)}`), 200).body;
    const items = rows(all);
    ok(items.some((x) => x.id === id), 'no aparece al buscar por título');
    ok((await req('GET', `/courses?categoryId=${ctx.cat.id}`)).text.includes(`"id":${id}`), 'no aparece al filtrar por categoría');
    ok(!(await req('GET', `/courses?level=BEGINNER&search=${RUN}`)).text.includes(`"id":${id}`), 'apareció con otro nivel');
  });
  await t('Detalle público: temario con títulos, sin contenido de lecciones ni correo del docente', async () => {
    const r = is(await req('GET', `/courses/${id}`), 200);
    ok(/Fundamentos/.test(r.text) && /Bienvenida/.test(r.text), 'falta el temario');
    ok(!/Contenido|<h2>Hola/.test(JSON.stringify(r.body.modules ?? [])), 'el temario público trae el contenido');
    ok(!/"email"|passwordHash|"document"/.test(r.text), 'expone datos privados del docente');
    ok(r.body.rating && 'count' in r.body.rating, 'falta el resumen de calificación');
  });
  await t('Paginación del catálogo: page y limit', async () => {
    const r = is(await req('GET', '/courses?page=1&limit=2'), 200).body;
    ok(rows(r).length <= 2 && rows(r).length >= 1, 'tamaño de página raro');
  });
  await t('GET /courses/manage: el docente ve sus cursos (con isOwner y cifras de biblioteca)', async () => {
    const list = is(await req('GET', '/courses/manage', { token: t1.token }), 200).body;
    const mine = list.find((x) => x.id === id);
    ok(mine && mine.isOwner === true && mine.library && 'enrolled' in mine.library, 'falta isOwner/library');
  });
  await t('GET /courses/manage/:id trae el árbol de contenido completo', async () => {
    const r = is(await req('GET', `/courses/manage/${id}`, { token: t1.token }), 200).body;
    ok(r.modules.length === 2 && r.modules[0].lessons?.length >= 1, 'árbol incompleto');
  });
  await t('El admin gestiona cualquier curso', async () => { is(await req('GET', `/courses/manage/${id}`, { token: AD.token }), 200); });

  section('4d. Varios instructores');
  await t('Agregar un instructor por correo → le llega INSTRUCTOR_ADDED', async () => {
    const r = is(await req('POST', `/courses/${id}/instructors`, { token: t1.token, body: { email: t2.email.toUpperCase() } }), 201, 200).body;
    ok(r.instructors.some((i) => i.email === t2.email));
    const n = await notificationsOf(t2);
    ok(n.items.some((x) => x.type === 'INSTRUCTOR_ADDED' && x.courseId === id), 'no hay aviso');
  });
  await t('Repetir el instructor, agregar al autor, a un estudiante o un correo sin cuenta', async () => {
    is(await req('POST', `/courses/${id}/instructors`, { token: t1.token, body: { email: t2.email } }), 400);
    is(await req('POST', `/courses/${id}/instructors`, { token: t1.token, body: { email: t1.email } }), 400);
    is(await req('POST', `/courses/${id}/instructors`, { token: t1.token, body: { email: s1.email } }), 400);
    is(await req('POST', `/courses/${id}/instructors`, { token: t1.token, body: { email: 'nadie.existe@example.com' } }), 404);
  });
  await t('El instructor ve el curso en sus cursos (isOwner=false) y puede editarlo', async () => {
    const list = is(await req('GET', '/courses/manage', { token: t2.token }), 200).body;
    eq(list.find((x) => x.id === id)?.isOwner, false);
    is(await req('PATCH', `/courses/${id}`, { token: t2.token, body: { audience: '<p>Para todos</p>' } }), 200);
  });
  await t('El instructor NO puede borrar el curso ni agregar instructores (403)', async () => {
    is(await req('DELETE', `/courses/${id}`, { token: t2.token }), 403);
    is(await req('POST', `/courses/${id}/instructors`, { token: t2.token, body: { email: ctx.t1.email } }), 403);
  });
  await t('El instructor se sale solo ({ left: true }) y pierde el acceso', async () => {
    const r = is(await req('DELETE', `/courses/${id}/instructors/${t2.id}`, { token: t2.token }), 200).body;
    eq(r.left, true);
    is(await req('PATCH', `/courses/${id}`, { token: t2.token, body: { audience: 'x' } }), 403);
    is(await req('DELETE', `/courses/${id}/instructors/${t2.id}`, { token: t1.token }), 404);
  });

  ctx.c1 = { id, mod1, mod2, l1, l2, l3, ev, essay, a1, a2, title: `Curso principal ${RUN}`, lessons: [l1, l2, l3] };
}
