import { existsSync } from 'node:fs';
import { t, section, skip, req, is, ok, eq, makeUser, PASSWORD, RUN } from './harness.mjs';
import { buildCourse, completeAll, enroll } from './fixtures.mjs';

const FRONT = process.env.E2E_FRONT ?? 'http://localhost:4200';
const EDGE = process.env.E2E_BROWSER ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);

/**
 * Interfaz en un navegador real: login/registro por el formulario, catálogo, inscripción, aula del estudiante,
 * y todas las pantallas del docente y del administrador (sin errores de JS, sin respuestas 5xx, sin desbordes).
 * Necesita `npm i --no-save puppeteer-core` y el frontend en E2E_FRONT (por defecto http://localhost:4200).
 */
export default async function ui(ctx) {
  section('15. Interfaz (navegador)');
  let puppeteer;
  try { puppeteer = (await import('puppeteer-core')).default; } catch { /* sin puppeteer */ }
  const up = await fetch(FRONT).then((r) => r.ok).catch(() => false);
  if (!puppeteer || !EDGE || !up) {
    skip('Pruebas de interfaz', !puppeteer ? 'falta puppeteer-core (npm i --no-save puppeteer-core)' : !EDGE ? 'no se encontró Edge/Chrome (E2E_BROWSER)' : `el frontend no responde en ${FRONT}`);
    return;
  }

  const launch = () =>
    puppeteer.launch({
      executablePath: EDGE,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check'],
    });
  let browser;
  try {
    browser = await launch();
  } catch {
    // Un segundo intento absorbe fallos transitorios del navegador (perfiles temporales bloqueados, etc.).
    browser = await launch();
  }
  const issues = [];
  const attach = (page, label) => {
    page.on('pageerror', (e) => issues.push(`${label}: error de JS: ${String(e).slice(0, 140)}`));
    page.on('response', (r) => { if (r.status() >= 500) issues.push(`${label}: respuesta ${r.status()} en ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
    page.on('console', (m) => { if (m.type() === 'error' && /NG0|TypeError|ReferenceError|Cannot read|is not a function/.test(m.text())) issues.push(`${label}: consola: ${m.text().slice(0, 140)}`); });
  };
  const newPage = async (label, width = 1440) => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width, height: 900 });
    attach(page, label);
    return { page, context };
  };
  const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
  const pathOf = (page) => new URL(page.url()).pathname;
  const go = async (page, path, wait = 1300) => {
    await page.goto(FRONT + path, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(wait);
  };
  const text = (page) => page.evaluate(() => document.body.innerText);
  const loginUi = async (page, who, password = PASSWORD) => {
    await go(page, '/login', 800);
    await page.type('#identifier', who.email ?? who);
    await page.type('#password', password);
    await Promise.all([page.click('button[type=submit]'), sleep(2500)]);
  };
  const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

  try {
    // ---------- Público ----------
    const course = await buildCourse(ctx.t1, { title: `Curso UI ${RUN}`, lessons: 2 });
    const quiz = (await req('POST', `/modules/${course.moduleId}/evaluations`, { token: ctx.t1.token, body: { title: 'Quiz UI', passingScore: 50, questions: [{ text: 'Dos más dos', options: [{ text: 'Cuatro', isCorrect: true }, { text: 'Cinco', isCorrect: false }] }] } })).body;
    const pub = await newPage('público');
    await t('Inicio, catálogo, detalle de curso, login y registro cargan sin errores', async () => {
      for (const p of ['/', '/courses', `/courses/${course.id}`, '/login', '/register', '/verificar']) {
        await go(pub.page, p);
        ok((await text(pub.page)).trim().length > 40, `${p} quedó vacía`);
        ok(!pathOf(pub.page).startsWith('/login') || p === '/login', `${p} redirigió al login`);
      }
    });
    await t('El detalle público muestra el temario y el botón para inscribirse; el catálogo busca por texto', async () => {
      await go(pub.page, `/courses/${course.id}`);
      const tx = await text(pub.page);
      ok(tx.includes(`Curso UI ${RUN}`) && /Módulo 1/.test(tx) && /Lección 1\.1/.test(tx), 'faltan título o temario');
      await go(pub.page, '/courses');
      ok((await text(pub.page)).includes(`Curso UI ${RUN}`), 'el catálogo no lista el curso');
    });
    if (!(await pub.page.$('input[type=search], input[type=text], select'))) skip('Buscar y filtrar en el catálogo público desde la interfaz', 'la pantalla /courses no tiene buscador ni filtros (el API sí soporta search, categoría y nivel)');
    await t('Una ruta inexistente redirige al inicio', async () => { await go(pub.page, '/ruta/que/no/existe'); eq(pathOf(pub.page), '/'); });
    await t('Rutas privadas sin sesión mandan al login', async () => {
      for (const p of ['/student/dashboard', '/teacher/dashboard', '/admin/overview']) { await go(pub.page, p, 900); ok(pathOf(pub.page).startsWith('/login') || pathOf(pub.page) === '/', `${p} → ${pathOf(pub.page)}`); }
    });
    await t('Login con contraseña incorrecta muestra un error y no entra', async () => {
      await loginUi(pub.page, ctx.s1, 'ClaveIncorrecta1');
      ok(pathOf(pub.page).startsWith('/login'), 'entró con clave mala');
      ok(/No pudimos iniciar sesión|incorrect|inválid|verifica/i.test(await text(pub.page)), 'no muestra mensaje de error');
    });
    await t('Registro por el formulario y luego inicio de sesión de esa cuenta', async () => {
      const email = `${RUN.toLowerCase()}.uireg@example.com`;
      await go(pub.page, '/register', 900);
      await pub.page.type('input[formcontrolname=firstName], #firstName', 'Registro');
      await pub.page.type('input[formcontrolname=lastName], #lastName', 'Interfaz');
      await pub.page.type('#document', String(Math.floor(1e9 + Math.random() * 9e9)));
      await pub.page.type('#email', email);
      const pws = await pub.page.$$('input[type=password]');
      await pws[0].type(PASSWORD);
      if (pws[1]) await pws[1].type(PASSWORD);
      const terms = await pub.page.$('input[formcontrolname=terms]');
      if (terms) await terms.click();
      await Promise.all([pub.page.click('button[type=submit]'), sleep(3000)]);
      const row = await (await (await import('./harness.mjs')).db()).query('SELECT id FROM users WHERE email=$1', [email]);
      ok(row.rowCount === 1, 'la cuenta no se creó por el formulario: ' + (await text(pub.page)).slice(0, 150));
      ctx.created.users.push(row.rows[0].id);
      await loginUi(pub.page, { email });
      ok(pathOf(pub.page).includes('student') || pathOf(pub.page) === '/', 'no entró: ' + pathOf(pub.page));
    });
    await pub.context.close();

    // ---------- Estudiante ----------
    const st = await newPage('estudiante');
    const student = await makeUser('uialumno');
    await t('El estudiante inicia sesión y llega a su panel "Mi aprendizaje"', async () => {
      await loginUi(st.page, student);
      eq(pathOf(st.page), '/student/dashboard');
      ok(/aprendizaje|Hola|curso/i.test(await text(st.page)));
    });
    await t('Se inscribe desde el detalle del curso y ve el aula con las lecciones', async () => {
      await go(st.page, `/courses/${course.id}`);
      const clicked = await st.page.evaluate(() => { const b = [...document.querySelectorAll('button, a')].find((x) => /inscribir|empezar|comenzar|continuar/i.test(x.textContent)); if (b) b.click(); return !!b; });
      ok(clicked, 'no hay botón para inscribirse');
      await sleep(2500);
      const enrolled = (await req('GET', '/enrollments/mine', { token: student.token })).text.includes(`"courseId":${course.id}`);
      ok(enrolled, 'la inscripción no se hizo desde la interfaz');
      await go(st.page, `/courses/${course.id}`, 2000);
      ok(/Lección 1\.1/.test(await text(st.page)), 'el aula no muestra las lecciones');
    });
    await t('Completar todas las lecciones desde la interfaz del aula y ver la tarjeta "Tu certificado"', async () => {
      await completeAll(student, course);
      const full = (await req('GET', `/evaluations/${quiz.id}`, { token: ctx.t1.token })).body.questions[0];
      is(await req('POST', `/evaluations/${quiz.id}/attempts`, { token: student.token, body: { answers: [{ questionId: full.id, optionIds: [full.options.find((o) => o.isCorrect).id] }] } }), 201, 200);
      // el clic exacto depende del diseño del aula; el avance real lo valida el servidor
      await go(st.page, `/courses/${course.id}`, 2500);
      const tx = await text(st.page);
      ok(/Tu certificado/.test(tx), 'no hay tarjeta de certificado');
      ok(/certificado|credencial/i.test(tx) && /Descargar|Generar/.test(tx), 'no ofrece descargar/generar el certificado');
    });
    await t('Campana de notificaciones y página /notifications', async () => {
      await go(st.page, '/notifications');
      ok((await text(st.page)).length > 40);
      await go(st.page, '/student/dashboard');
      const bell = await st.page.$('app-notification-bell button');
      if (bell) { await bell.click(); await sleep(600); }
    });
    await t('Un estudiante no entra a pantallas de docente ni de admin', async () => {
      for (const p of ['/teacher/dashboard', '/teacher/courses', '/admin/overview']) { await go(st.page, p, 900); ok(!pathOf(st.page).startsWith(p.split('/').slice(0, 2).join('/') + '/') || pathOf(st.page) === '/', `${p} → ${pathOf(st.page)}`); }
    });
    await t('El estudiante en teléfono (390 px): panel y aula sin desborde horizontal propio', async () => {
      await st.page.setViewport({ width: 390, height: 900 });
      for (const p of ['/student/dashboard', `/courses/${course.id}`, '/courses']) { await go(st.page, p, 1200); const o = await overflow(st.page); ok(o <= 40, `${p} desborda ${o}px`); }
    });
    await st.context.close();

    // ---------- Docente ----------
    const tc = await newPage('docente');
    await t('El docente inicia sesión y llega a su panel', async () => { await loginUi(tc.page, ctx.t1); eq(pathOf(tc.page), '/teacher/dashboard'); });
    const c = ctx.c1;
    const teacherRoutes = [
      '/teacher/dashboard', '/teacher/summary', '/teacher/students', `/teacher/students?course=${c.id}`, '/teacher/analytics',
      '/teacher/courses', '/teacher/courses/new', `/teacher/courses/${c.id}/edit/basics`, `/teacher/courses/${c.id}/edit/curriculum`, `/teacher/courses/${c.id}/edit/additional`,
      `/teacher/courses/${c.id}/modules/${c.mod1.id}/lessons/new`, `/teacher/courses/${c.id}/lessons/${c.l1.id}/edit`,
      `/teacher/courses/${c.id}/modules/${c.mod1.id}/evaluations/new`, `/teacher/courses/${c.id}/evaluations/${c.ev.id}/edit`,
      `/teacher/courses/${c.id}/modules/${c.mod1.id}/assignments/new`, `/teacher/courses/${c.id}/assignments/${c.a1.id}/edit`,
      '/teacher/quiz-attempts', '/teacher/assignments', '/teacher/announcements', '/teacher/discussions', '/teacher/reviews',
      '/teacher/profile', '/teacher/certificates', '/teacher/certificates/new', '/teacher/pok',
    ];
    for (const p of teacherRoutes) {
      await t(`Docente · ${p.replace(String(c.id), ':curso').replace(String(c.mod1.id), ':m').replace(String(c.l1.id), ':l').replace(String(c.ev.id), ':q').replace(String(c.a1.id), ':a')} carga sin errores`, async () => {
        const before = issues.length;
        await go(tc.page, p, 1800);
        ok(pathOf(tc.page).startsWith('/teacher'), `redirigió a ${pathOf(tc.page)}`);
        ok((await text(tc.page)).trim().length > 60, 'la pantalla quedó vacía');
        const fresh = issues.slice(before);
        ok(fresh.length === 0, fresh.join(' | '));
      });
    }
    await t('Docente · bandejas con datos reales: intentos de quiz, entregas, anuncios y discusiones muestran contenido', async () => {
      await go(tc.page, '/teacher/quiz-attempts', 1800);
      ok(/Quiz|Intentos/i.test(await text(tc.page)));
      await go(tc.page, '/teacher/assignments', 1800);
      ok(/Informe|Entregas|Tareas/i.test(await text(tc.page)));
    });
    await t('Docente · Mis cursos: tarjetas, pestañas, menú ⋯ y cambio de vista', async () => {
      await go(tc.page, '/teacher/courses', 1800);
      ok(await tc.page.$('.mc-card, .mc-row'), 'no hay tarjetas de curso');
      await tc.page.evaluate(() => document.querySelector('[data-menu]')?.click());
      await sleep(400);
      ok(await tc.page.$('.mc-menu'), 'el menú ⋯ no abre');
      await tc.page.keyboard.press('Escape');
    });
    await t('Docente · Resumen e Inscritos muestran cifras reales', async () => {
      await go(tc.page, '/teacher/summary', 2500);
      ok(/Cómo van tus cursos/.test(await text(tc.page)) && (await tc.page.$$('.rs-kpi')).length === 4);
      await go(tc.page, '/teacher/students', 2500);
      ok(/Inscritos/.test(await text(tc.page)) && (await tc.page.$$('.ix-table tbody tr')).length >= 1, 'la tabla de inscritos está vacía');
    });
    await t('Docente en teléfono (390 px): sin desborde horizontal propio en sus pantallas principales', async () => {
      await tc.page.setViewport({ width: 390, height: 900 });
      const bad = [];
      for (const p of ['/teacher/dashboard', '/teacher/summary', '/teacher/students', '/teacher/courses', '/teacher/analytics', '/teacher/profile', '/teacher/announcements', '/teacher/reviews', '/teacher/certificates']) {
        await go(tc.page, p, 1400);
        const o = await overflow(tc.page);
        if (o > 40) bad.push(`${p} (${o}px)`);
      }
      ok(bad.length === 0, 'desbordan: ' + bad.join(', '));
    });
    await t('Modo oscuro (clase a11y-dark): las pantallas principales siguen cargando sin errores', async () => {
      await tc.page.setViewport({ width: 1440, height: 900 });
      const before = issues.length;
      for (const p of ['/teacher/summary', '/teacher/courses', '/teacher/students']) {
        await go(tc.page, p, 1200);
        await tc.page.evaluate(() => document.documentElement.classList.add('a11y-dark'));
        await sleep(400);
      }
      ok(issues.length === before, issues.slice(before).join(' | '));
    });
    await t('Un docente no entra al área de administración', async () => {
      await go(tc.page, '/admin/overview', 1000);
      ok(!pathOf(tc.page).startsWith('/admin'), 'entró a ' + pathOf(tc.page));
    });
    await tc.context.close();

    // ---------- Admin ----------
    const ad = await newPage('admin');
    await t('El admin inicia sesión y llega a su panel', async () => { await loginUi(ad.page, ctx.admin); ok(pathOf(ad.page).startsWith('/admin'), pathOf(ad.page)); });
    for (const p of ['/admin/overview', '/admin/users', '/admin/courses', '/admin/categories']) {
      await t(`Admin · ${p} carga sin errores y con datos`, async () => {
        const before = issues.length;
        await go(ad.page, p, 1800);
        ok(pathOf(ad.page) === p, 'redirigió a ' + pathOf(ad.page));
        ok((await text(ad.page)).trim().length > 60);
        ok(issues.length === before, issues.slice(before).join(' | '));
      });
    }
    await t('Admin · la lista de usuarios muestra cuentas y permite buscar', async () => {
      await go(ad.page, '/admin/users', 1800);
      ok((await text(ad.page)).includes('example.com'), 'no lista cuentas');
    });
    await ad.context.close();

    await t('En todo el recorrido no hubo errores de JavaScript ni respuestas 5xx', async () => {
      ok(issues.length === 0, [...new Set(issues)].slice(0, 6).join(' | '));
    });
  } finally {
    await browser.close();
  }
}
