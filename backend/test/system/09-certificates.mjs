import { t, section, skip, req, is, ok, eq } from './harness.mjs';
import { buildCourse, enroll, completeAll, notificationsOf, rows } from './fixtures.mjs';

const LAYOUTS = ['CLASSIC', 'MODERN', 'ELEGANT', 'BOLD', 'MINIMAL', 'SEAL', 'GEOMETRIC', 'SIDEBAR', 'FRAME', 'DARK', 'WAVES', 'RIBBON'];

export default async function certificates(ctx) {
  const { t1, t2, s1, s2, s3, admin: AD } = ctx;
  section('10. Plantillas de certificado');

  let tpl;
  const body = { name: `Plantilla ${ctx.run}`, title: 'Certificado de finalización', body: 'Por completar «{{course}}» con {{instructor}} el {{date}}. Duración: {{hours}}.', accentColor: '#1F3A8A', layout: 'CLASSIC', font: 'playfair-display', bodyFont: 'lora', style: { title: { italic: true, size: 120 }, showDocument: true } };
  await t('Crear una plantilla con tipografías y estilo', async () => {
    tpl = is(await req('POST', '/certificate-templates', { token: t1.token, body }), 201).body;
    ctx.created.templates.push(tpl.id);
    ok(tpl.id);
  });
  await t('Marcador mal escrito ({{estudiante}}) → 400 listando los válidos; color inválido → 400', async () => {
    const r = is(await req('POST', '/certificate-templates', { token: t1.token, body: { ...body, name: 'Mala', body: 'Hola {{estudiante}}' } }), 400);
    ok(/student|course|date/.test(r.text), r.text);
    is(await req('POST', '/certificate-templates', { token: t1.token, body: { ...body, name: 'Mala2', accentColor: 'rojo' } }), 400);
    is(await req('POST', '/certificate-templates', { token: t1.token, body: { ...body, name: 'Mala3', style: { title: { size: 500 } } } }), 400);
  });
  await t('IMAGE sin imagen de fondo → 400; con imagen subida → 201', async () => {
    is(await req('POST', '/certificate-templates', { token: t1.token, body: { ...body, name: 'Img0', layout: 'IMAGE' } }), 400);
    const r = is(await req('POST', '/certificate-templates', { token: t1.token, body: { ...body, name: `Img ${ctx.run}`, layout: 'IMAGE', backgroundUrl: ctx.image.url } }), 201).body;
    ctx.created.templates.push(r.id);
    const pdf = is(await req('GET', `/certificate-templates/${r.id}/preview`, { token: t1.token, raw: true }), 200);
    ok(pdf.buf.subarray(0, 4).toString() === '%PDF');
  });
  await t('Listar y ver mis plantillas; otro docente no las ve ni usa (403)', async () => {
    const list = is(await req('GET', '/certificate-templates', { token: t1.token }), 200).body;
    ok(list.some((x) => x.id === tpl.id) && '_count' in list[0]);
    ok(!is(await req('GET', '/certificate-templates', { token: t2.token }), 200).body.some((x) => x.id === tpl.id));
    is(await req('GET', `/certificate-templates/${tpl.id}`, { token: t2.token }), 403);
    is(await req('GET', `/certificate-templates/${tpl.id}`, { token: s1.token }), 403);
  });
  await t('Editar una plantilla', async () => {
    const r = is(await req('PATCH', `/certificate-templates/${tpl.id}`, { token: t1.token, body: { title: 'Constancia' } }), 200).body;
    eq(r.title, 'Constancia');
  });
  await t('Vista previa en PDF (A4) de los 12 diseños', async () => {
    for (const layout of LAYOUTS) {
      const r = is(await req('POST', '/certificate-templates', { token: t1.token, body: { ...body, name: `L-${layout}-${ctx.run}`, layout } }), 201).body;
      ctx.created.templates.push(r.id);
      const pdf = is(await req('GET', `/certificate-templates/${r.id}/preview`, { token: t1.token, raw: true }), 200);
      ok(pdf.buf.subarray(0, 4).toString() === '%PDF' && pdf.buf.length > 1000, `el diseño ${layout} no generó un PDF válido`);
      is(await req('DELETE', `/certificate-templates/${r.id}`, { token: t1.token }), 200);
    }
  });
  await t('Catálogo de tipografías (biblioteca de 28 + estándar)', async () => {
    const r = is(await req('GET', '/certificate-fonts', { token: t1.token }), 200).body;
    ok(r.library.length >= 28 && r.standard.length >= 2, 'faltan tipografías: ' + r.library?.length);
    const file = r.library[0].regularUrl.replace('/api', '');
    const f = is(await req('GET', file, { raw: true }), 200);
    ok(f.buf.length > 5000, 'archivo de tipografía vacío');
    is(await req('GET', '/certificate-fonts', { token: s1.token }), 403);
  });

  section('10b. Emisión del certificado');
  const cert = await buildCourse(t1, { title: `Con certificado ${ctx.run}`, lessons: 2 });
  await t('Asignar la plantilla al curso (certificatesIssued = 0 al no haber terminados)', async () => {
    const r = is(await req('PATCH', `/courses/${cert.id}`, { token: t1.token, body: { certificateTemplateId: tpl.id } }), 200).body;
    eq(r.certificatesIssued, 0);
    eq(is(await req('GET', `/courses/manage/${cert.id}`, { token: t1.token }), 200).body.certificateTemplate.id, tpl.id);
  });
  await t('No se puede usar la plantilla de otro docente (403/400)', async () => {
    const r = await req('PATCH', `/courses/${cert.id}`, { token: t2.token, body: { certificateTemplateId: tpl.id } });
    ok([400, 403].includes(r.status), 'estado ' + r.status);
  });
  await t('Antes de terminar: completion dice que falta contenido y claim se rechaza', async () => {
    is(await enroll(s1, cert), 201, 200);
    const c = is(await req('GET', `/certificates/courses/${cert.id}/completion`, { token: s1.token }), 200).body;
    eq(c.eligible, false);
    const claim = await req('POST', `/certificates/courses/${cert.id}/claim`, { token: s1.token });
    ok([400, 403, 409].includes(claim.status), 'emitió sin terminar: ' + claim.status);
  });
  let mine;
  await t('Al completar la última lección se emite solo el certificado y llega CERTIFICATE_ISSUED', async () => {
    await completeAll(s1, cert);
    const list = is(await req('GET', '/certificates/mine', { token: s1.token }), 200).body;
    mine = list.find((x) => x.courseId === cert.id);
    ok(mine && /^CC-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(mine.code), 'no hay certificado o el código es raro: ' + JSON.stringify(mine));
    ok((await notificationsOf(s1)).items.some((x) => x.type === 'CERTIFICATE_ISSUED' && x.refId === mine.id));
  });
  await t('Completar de nuevo no duplica el certificado', async () => {
    await req('DELETE', `/lessons/${cert.lessons[0].id}/complete`, { token: s1.token });
    await req('POST', `/lessons/${cert.lessons[0].id}/complete`, { token: s1.token });
    const list = is(await req('GET', '/certificates/mine', { token: s1.token }), 200).body;
    eq(list.filter((x) => x.courseId === cert.id).length, 1);
  });
  await t('Descargar el PDF: lo baja su dueño y el docente; otra persona recibe 404', async () => {
    const pdf = is(await req('GET', `/certificates/${mine.id}/pdf`, { token: s1.token, raw: true }), 200);
    eq(pdf.buf.subarray(0, 4).toString(), '%PDF');
    ok(/pdf/.test(pdf.headers.get('content-type')));
    is(await req('GET', `/certificates/${mine.id}/pdf`, { token: t1.token, raw: true }), 200);
    is(await req('GET', `/certificates/${mine.id}/pdf`, { token: s2.token }), 404);
    is(await req('GET', `/certificates/${mine.id}/pdf`, { token: t2.token }), 404);
    is(await req('GET', `/certificates/${mine.id}/pdf`), 401);
  });
  await t('Verificación pública: válida, sin datos privados; minúsculas funcionan; código falso 404', async () => {
    const r = is(await req('GET', `/certificates/verify/${mine.code}`), 200);
    eq(r.body.valid, true);
    ok(!/document|email|studentDocument/i.test(r.text), 'la verificación pública expone datos privados');
    is(await req('GET', `/certificates/verify/${mine.code.toLowerCase()}`), 200);
    is(await req('GET', '/certificates/verify/CC-AAAA-BBBB-CCCC'), 404);
    is(await req('GET', '/certificates/verify/esto-no-es-un-codigo'), 404);
  });
  await t('El docente lista los certificados emitidos y corrige el nombre (el código no cambia)', async () => {
    const list = is(await req('GET', `/certificates?courseId=${cert.id}`, { token: t1.token }), 200).body;
    const row = rows(list).find((x) => x.id === mine.id);
    ok(row, 'no aparece en la lista del docente');
    const r = is(await req('PATCH', `/certificates/${mine.id}`, { token: t1.token, body: { studentName: 'Nombre Corregido' } }), 200).body;
    eq(r.code, mine.code);
    eq(is(await req('GET', `/certificates/verify/${mine.code}`), 200).body.studentName, 'Nombre Corregido');
    is(await req('PATCH', `/certificates/${mine.id}`, { token: t2.token, body: { studentName: 'X Y' } }), 403, 404);
    is(await req('PATCH', `/certificates/${mine.id}`, { token: t1.token, body: {} }), 400);
  });
  await t('Actualizar el diseño del certificado con la plantilla actual', async () => {
    is(await req('POST', `/certificates/${mine.id}/refresh`, { token: t1.token }), 200, 201);
    is(await req('POST', `/certificates/${mine.id}/refresh`, { token: s1.token }), 403);
  });
  await t('Una plantilla en uso no se borra (409)', async () => { is(await req('DELETE', `/certificate-templates/${tpl.id}`, { token: t1.token }), 409); });
  await t('Un curso SIN plantilla emite igual, con el diseño predeterminado de la plataforma', async () => {
    const late = await buildCourse(t1, { title: `Sin plantilla ${ctx.run}`, lessons: 1 });
    is(await enroll(s3, late), 201, 200);
    await completeAll(s3, late);
    const c = is(await req('GET', '/certificates/mine', { token: s3.token }), 200).body.find((x) => x.courseId === late.id);
    ok(c, 'no se emitió certificado');
    eq(c.provider, 'PLATFORM');
    const pdf = is(await req('GET', `/certificates/${c.id}/pdf`, { token: s3.token, raw: true }), 200);
    eq(pdf.buf.subarray(0, 4).toString(), '%PDF');
    ctx.late = late;
  });
  await t('Asignar una plantilla a un curso cuyos estudiantes ya tienen certificado no duplica (certificatesIssued 0)', async () => {
    const r = is(await req('PATCH', `/courses/${ctx.late.id}`, { token: t1.token, body: { certificateTemplateId: tpl.id } }), 200).body;
    eq(r.certificatesIssued, 0);
  });
  await t('Revocar: verify → valid:false; el dueño ya no descarga (403)', async () => {
    is(await req('PATCH', `/certificates/${mine.id}/revoke`, { token: s2.token }), 403, 404);
    is(await req('PATCH', `/certificates/${mine.id}/revoke`, { token: t1.token }), 200);
    const v = is(await req('GET', `/certificates/verify/${mine.code}`), 200).body;
    eq(v.valid, false);
    eq(v.status, 'REVOKED');
    is(await req('GET', `/certificates/${mine.id}/pdf`, { token: s1.token }), 403);
  });
  await t('Quitar el certificado del curso (null) y borrar la plantilla cuando nadie la usa', async () => {
    is(await req('PATCH', `/courses/${cert.id}`, { token: t1.token, body: { certificateTemplateId: null } }), 200);
    is(await req('PATCH', `/courses/${ctx.late.id}`, { token: t1.token, body: { certificateTemplateId: null } }), 200);
    const r = await req('DELETE', `/certificate-templates/${tpl.id}`, { token: t1.token });
    ok([200, 409].includes(r.status), 'estado ' + r.status);
  });

  section('10c. Credenciales POK (solo lectura: no se emite nada real)');
  let pokOk = false;
  await t('GET /pok/status responde con la organización conectada', async () => {
    const r = is(await req('GET', '/pok/status', { token: t1.token }), 200).body;
    ok(r.configured === true || r.connected === true || r.ok === true || r.organization, 'estado raro: ' + JSON.stringify(r).slice(0, 200));
    pokOk = true;
  });
  await t('Los estudiantes no ven la configuración de POK (403) ni sin sesión (401)', async () => {
    is(await req('GET', '/pok/status', { token: s1.token }), 403);
    is(await req('GET', '/pok/templates', { token: s1.token }), 403);
    is(await req('GET', '/pok/status'), 401);
  });
  if (!pokOk) skip('Diseños y cursos de POK', 'POK no respondió en /pok/status');
  else {
    let first;
    await t('Listar los diseños de POK y ver la vista previa real (PNG)', async () => {
      const r = is(await req('GET', '/pok/templates', { token: t1.token }), 200).body;
      const list = Array.isArray(r) ? r : r.templates ?? r.items ?? r.data;
      ok(Array.isArray(list), 'forma rara: ' + JSON.stringify(r).slice(0, 150));
      first = list[0];
      if (first) {
        const p = await req('GET', `/pok/templates/${first.id}/preview`, { token: t1.token, raw: true });
        ok([200, 502, 503].includes(p.status), 'estado ' + p.status);
      }
    });
    await t('Elegir el diseño de POK para un curso y verlo en /pok/courses (sin emitir)', async () => {
      if (!first) return;
      const c = await buildCourse(t1, { title: `Curso POK ${ctx.run}`, lessons: 1 });
      is(await req('PUT', `/pok/courses/${c.id}/template`, { token: t1.token, body: { pokTemplateId: first.id } }), 200, 201);
      const list = is(await req('GET', '/pok/courses', { token: t1.token }), 200).body;
      ok(JSON.stringify(list).includes(`${c.id}`), 'el curso no figura en /pok/courses');
    });
  }
  await t('El webhook de POK rechaza llamadas sin firma válida', async () => {
    const r = await req('POST', '/pok/webhook', { body: { event: 'credential.emitted', data: { id: 'x' } } });
    ok([400, 401, 403, 503].includes(r.status), 'aceptó un webhook sin firma: ' + r.status);
  });
}
