import { req, is, ok, ctx, RUN } from './harness.mjs';

/**
 * Arma un curso completo por la API (borrador → datos → módulo → lecciones → publicar), como lo haría un docente.
 * `patch` son campos extra de PATCH /courses/:id (precio, visibilidad, contraseña…). `publish: false` lo deja en borrador.
 */
export async function buildCourse(owner, { title, patch = {}, lessons = 2, modules = 1, publish = true } = {}) {
  const draft = is(await req('POST', '/courses/draft', { token: owner.token }), 201, 200).body;
  const id = draft.id;
  ctx.created.courses.push(id);
  is(await req('PATCH', `/courses/${id}`, { token: owner.token, body: { title: title ?? `Curso ${RUN}`, description: '<p>Curso de <b>prueba</b> automática.</p>', ...patch } }), 200);
  const mods = [];
  for (let m = 1; m <= modules; m++) {
    const mod = is(await req('POST', `/courses/${id}/modules`, { token: owner.token, body: { title: `Módulo ${m}` } }), 201).body;
    const ls = [];
    for (let l = 1; l <= lessons; l++) {
      ls.push(is(await req('POST', `/modules/${mod.id}/lessons`, { token: owner.token, body: { title: `Lección ${m}.${l}`, content: `<p>Contenido ${m}.${l}</p>`, durationMinutes: 5 } }), 201).body);
    }
    mods.push({ id: mod.id, lessons: ls });
  }
  if (publish) is(await req('PATCH', `/courses/${id}/status`, { token: owner.token, body: { status: 'PUBLISHED' } }), 200);
  return { id, title: title ?? `Curso ${RUN}`, modules: mods, moduleId: mods[0].id, lessons: mods.flatMap((m) => m.lessons) };
}

export async function enroll(student, course, body = {}) {
  return req('POST', `/courses/${course.id}/enroll`, { token: student.token, body });
}

export async function completeAll(student, course) {
  for (const lesson of course.lessons) is(await req('POST', `/lessons/${lesson.id}/complete`, { token: student.token }), 200, 201);
}

export function notificationsOf(user, query = '') {
  return req('GET', `/notifications?limit=100${query}`, { token: user.token }).then((r) => is(r, 200).body);
}

export { ok };

/** Filas de una respuesta paginada: el catálogo responde { data }, otras listas { items }. */
export const rows = (body) => body?.data ?? body?.items ?? body ?? [];

/**
 * Deja listos los datos base que usan varias secciones (categoría e imagen), por si una sección se corre sola.
 */
export async function ensureBase(ctx) {
  const { upload, png } = await import('./harness.mjs');
  if (!ctx.cat) {
    ctx.cat = is(await req('POST', '/categories', { token: ctx.t1.token, body: { name: `Cat base ${RUN}` } }), 201).body;
    ctx.created.categories.push(ctx.cat.id);
  }
  if (!ctx.image) ctx.image = is(await upload('images', ctx.t1.token, png(), 'base.png', 'image/png'), 201).body;
}
