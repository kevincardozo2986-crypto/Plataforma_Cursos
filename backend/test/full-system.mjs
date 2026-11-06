import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, RUN, ctx, results, db, closeDb, req } from './system/harness.mjs';

/**
 * PRUEBA COMPLETA DEL SISTEMA (API).
 *
 *   cd backend && node test/full-system.mjs            # con el backend en http://localhost:3000
 *   node test/full-system.mjs --keep                    # no borra lo que crea (para revisarlo a mano)
 *   node test/full-system.mjs --only=notifications      # solo las secciones cuyo nombre contenga el texto
 *
 * Crea sus propias cuentas y cursos (todos con el prefijo E2E…@example.com), recorre cada módulo con los tres
 * roles (estudiante, docente, admin) y al terminar los borra. Deja el informe en test/system/informe.md y .json.
 * Termina con código 1 si algo falla.
 */
const here = dirname(fileURLToPath(import.meta.url));
const keep = process.argv.includes('--keep');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const SECTIONS = [
  ['01-auth', 'auth'],
  ['02-admin', 'admin'],
  ['03-profile-uploads', 'perfil y archivos'],
  ['04-teacher-content', 'contenido del docente'],
  ['05-access-enroll', 'acceso e inscripción'],
  ['06-assessments', 'evaluaciones y tareas'],
  ['07-communication', 'comunicación'],
  ['08-reviews-notifications', 'reseñas y notificaciones'],
  ['09-certificates', 'certificados'],
  ['10-dashboard', 'dashboard'],
  ['11-payments', 'pagos'],
  ['12-security', 'seguridad'],
  ['13-ui', 'interfaz'],
  ['99-cleanup-rules', 'borrado de cursos'],
];

const started = new Date();
console.log(`Prueba completa ${RUN} contra ${BASE}`);

try {
  const up = await fetch(BASE + '/').catch(() => null);
  if (!up) throw new Error('El backend no responde en ' + BASE);
  for (const [file, name] of SECTIONS) {
    if (only && !(file + name).includes(only) && file !== '01-auth') continue;
    try {
      const mod = await import(`./system/${file}.mjs`);
      await mod.default(ctx);
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' && String(error.message).includes(file)) continue;
      results.push({ section: name, name: `La sección «${name}» se interrumpió`, status: 'FAIL', detail: String(error?.stack ?? error).split('\n').slice(0, 3).join(' | ') });
      console.log(`FAIL  La sección «${name}» se interrumpió: ${error?.message}`);
    }
  }
} finally {
  if (!keep) await cleanup().catch((e) => console.log('Limpieza incompleta: ' + e.message));
  await closeDb();
}

async function cleanup() {
  const client = await db();
  const ids = ctx.created.users;
  if (ids.length === 0) return;
  // Solo se borra lo que esta ejecución creó: sus cuentas (por id y por el prefijo del correo) y lo que cuelga de ellas.
  const prefix = RUN.toLowerCase() + '.%@example.com';
  const users = (await client.query('SELECT id FROM users WHERE id = ANY($1) AND email LIKE $2', [ids, prefix])).rows.map((r) => r.id);
  if (users.length === 0) return;
  const courses = (await client.query('SELECT id FROM courses WHERE "teacherId" = ANY($1)', [users])).rows.map((r) => r.id);
  if (courses.length) {
    await client.query('DELETE FROM notifications WHERE "courseId" = ANY($1)', [courses]);
    await client.query('DELETE FROM payments WHERE "courseId" = ANY($1)', [courses]);
    await client.query('DELETE FROM enrollments WHERE "courseId" = ANY($1)', [courses]);
    await client.query('DELETE FROM courses WHERE id = ANY($1)', [courses]);
  }
  await client.query('DELETE FROM notifications WHERE "userId" = ANY($1)', [users]);
  await client.query('DELETE FROM payments WHERE "userId" = ANY($1)', [users]);
  await client.query('DELETE FROM enrollments WHERE "userId" = ANY($1)', [users]);
  await client.query('DELETE FROM certificate_templates WHERE "teacherId" = ANY($1)', [users]).catch(() => {});
  await client.query('DELETE FROM users WHERE id = ANY($1)', [users]);
  if (ctx.created.categories.length) await client.query('DELETE FROM categories WHERE id = ANY($1) AND name LIKE $2', [ctx.created.categories, '%' + RUN + '%']).catch(() => {});
  console.log(`\nLimpieza: ${users.length} cuentas y ${courses.length} cursos de prueba eliminados.`);
}

// ---- Informe ----
const count = (s) => results.filter((r) => r.status === s).length;
const pass = count('PASS'), fail = count('FAIL'), skipped = count('SKIP');
const finished = new Date();
const bySection = new Map();
for (const r of results) bySection.set(r.section, [...(bySection.get(r.section) ?? []), r]);

let md = `# Informe de la prueba completa del sistema\n\n`;
md += `- Ejecución: \`${RUN}\` · ${started.toLocaleString('es-CO')} · ${Math.round((finished - started) / 1000)} s · servidor ${BASE}\n`;
md += `- **${pass} pasan · ${fail} fallan · ${skipped} no verificables** (de ${results.length})\n\n`;
if (fail) {
  md += `## Fallos\n\n`;
  for (const r of results.filter((x) => x.status === 'FAIL')) md += `- **${r.section}** — ${r.name}\n  - ${r.detail}\n`;
  md += '\n';
}
if (skipped) {
  md += `## No verificables en este entorno\n\n`;
  for (const r of results.filter((x) => x.status === 'SKIP')) md += `- **${r.section}** — ${r.name}: ${r.detail}\n`;
  md += '\n';
}
md += `## Detalle por sección\n\n`;
for (const [name, list] of bySection) {
  md += `### ${name} (${list.filter((x) => x.status === 'PASS').length}/${list.length})\n\n`;
  for (const r of list) md += `- ${r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️'} ${r.name}\n`;
  md += '\n';
}
writeFileSync(join(here, 'system', 'informe.md'), md);
writeFileSync(join(here, 'system', 'informe.json'), JSON.stringify({ run: RUN, started, finished, base: BASE, pass, fail, skipped, results }, null, 1));
console.log(`\n==== ${pass} pasan · ${fail} fallan · ${skipped} no verificables (de ${results.length}) ====`);
console.log('Informe: backend/test/system/informe.md');
process.exit(fail ? 1 : 0);
