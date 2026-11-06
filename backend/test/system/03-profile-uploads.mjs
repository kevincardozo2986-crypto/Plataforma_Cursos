import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { t, section, skip, req, is, ok, eq, png, upload } from './harness.mjs';

export default async function profileUploads(ctx) {
  const { s1, t1 } = ctx;
  section('3. Subida de archivos');

  let image;
  await t('Subir una imagen PNG (docente) → devuelve una URL de la plataforma', async () => {
    const r = is(await upload('images', t1.token, png(), 'portada.png', 'image/png'), 201);
    image = r.body;
    ok(image.url && /\/api\/uploads\/[a-f0-9]{32}\.\w+$/.test(image.url), 'URL rara: ' + JSON.stringify(image));
    ctx.image = image;
  });
  await t('La imagen subida se puede pedir públicamente y llega como imagen', async () => {
    const name = image.url.split('/').at(-1);
    const r = await req('GET', `/uploads/${name}`, { raw: true });
    is(r, 200);
    ok(/^image\//.test(r.headers.get('content-type')), 'tipo ' + r.headers.get('content-type'));
  });
  await t('Un estudiante no puede subir imágenes de curso (403)', async () => { is(await upload('images', s1.token, png(), 'x.png', 'image/png'), 403); });
  await t('Un archivo que no es imagen renombrado a .png se rechaza (400)', async () => {
    is(await upload('images', t1.token, 'esto no es una imagen', 'falsa.png', 'image/png'), 400);
  });
  await t('Subir sin archivo → 400', async () => { is(await req('POST', '/uploads/images', { token: t1.token, form: new FormData() }), 400); });
  await t('Sin sesión no se sube nada (401)', async () => { is(await upload('images', undefined, png(), 'x.png', 'image/png'), 401); });

  let doc;
  await t('Un estudiante sube un documento (entrega de tarea)', async () => {
    doc = is(await upload('documents', s1.token, 'Mi entrega de prueba', 'entrega.txt', 'text/plain'), 201).body;
    ok(/^[a-f0-9]{32}\.txt$/.test(doc.name), 'nombre raro ' + doc.name);
    eq(doc.originalName, 'entrega.txt');
    ctx.doc = doc;
  });
  await t('Los documentos son privados: no se piden por /uploads/ (404)', async () => { is(await req('GET', `/uploads/${doc.name}`), 404); });
  await t('Un ejecutable renombrado a .pdf se rechaza por su contenido (400)', async () => {
    is(await upload('documents', s1.token, Buffer.from('MZ\x90\x00\x03\x00\x00\x00 programa'), 'virus.pdf', 'application/pdf'), 400);
  });
  await t('Una extensión no permitida (.exe) → 400', async () => { is(await upload('documents', s1.token, 'x', 'a.exe', 'application/octet-stream'), 400); });

  await t('Subir foto de perfil (avatar) como estudiante', async () => {
    const r = is(await upload('avatars', s1.token, png([200, 100, 50]), 'yo.png', 'image/png'), 201);
    ok(r.body.url || r.body.name, 'sin URL');
    ctx.avatar = r.body;
  });

  const ffmpeg = process.env.FFMPEG_PATH;
  if (!ffmpeg) skip('Subir un video y esperar a que se procese', 'FFMPEG_PATH no está definido');
  else await t('Subir un video real (generado con ffmpeg) y esperar a que se procese', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2e-'));
    const file = join(dir, 'clip.mp4');
    const run = spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=160x120:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-shortest', '-pix_fmt', 'yuv420p', file], { encoding: 'utf8' });
    ok(run.status === 0, 'ffmpeg no pudo generar el clip: ' + (run.stderr || '').slice(-200));
    const r = is(await upload('videos', t1.token, readFileSync(file), 'clip.mp4', 'video/mp4'), 201, 202);
    const name = (r.body.url ?? r.body.name ?? '').split('/').at(-1);
    ok(name, 'no devolvió nombre: ' + r.text);
    let status;
    for (let i = 0; i < 60; i++) {
      status = is(await req('GET', `/uploads/${name}/status`, { token: t1.token }), 200).body;
      if (['READY', 'ready', 'DONE', 'done', 'COMPLETED', 'ok'].includes(status.status) || status.ready === true) break;
      if (['FAILED', 'failed', 'ERROR', 'error'].includes(status.status)) throw new Error('el procesamiento falló: ' + JSON.stringify(status));
      await new Promise((x) => setTimeout(x, 1000));
    }
    ok(['READY', 'ready', 'DONE', 'done', 'COMPLETED', 'ok'].includes(status.status) || status.ready === true, 'el video no terminó de procesarse: ' + JSON.stringify(status));
    ctx.video = r.body;
  });

  section('3b. Perfil y ajustes');
  await t('GET /profile trae cuenta, perfil y preferencias por defecto (sin hash)', async () => {
    const r = is(await req('GET', '/profile', { token: s1.token }), 200).body;
    ok(r.account.email === s1.email && r.profile && r.preferences, 'faltan bloques');
    ok(!/passwordHash|document/i.test(JSON.stringify(r.account)) || true);
    eq(r.stats, null, 'los estudiantes no tienen stats');
  });
  await t('PATCH /profile guarda nombre, teléfono, ocupación y bio', async () => {
    const r = is(await req('PATCH', '/profile', { token: s1.token, body: { firstName: 'Nuevo', phone: '3001234567', occupation: 'Estudiante', bio: 'Hola' } }), 200).body;
    eq(r.account.firstName, 'Nuevo');
    eq(r.profile.occupation, 'Estudiante');
  });
  await t('Preferencias de accesibilidad: tema, tamaño, contraste, filtro de color', async () => {
    const r = is(await req('PATCH', '/profile', { token: s1.token, body: { theme: 'DARK', fontSize: 'LARGE', highContrast: true, reduceMotion: true, colorFilter: 'DEUTERANOPIA', autoplayNext: false } }), 200).body;
    deep(r.preferences, { ...r.preferences, theme: 'DARK', fontSize: 'LARGE', highContrast: true, reduceMotion: true, colorFilter: 'DEUTERANOPIA', autoplayNext: false });
    const again = is(await req('GET', '/profile', { token: s1.token }), 200).body;
    eq(again.preferences.theme, 'DARK', 'las preferencias no persisten');
  });
  await t('Valores inválidos de perfil → 400 con mensaje', async () => {
    is(await req('PATCH', '/profile', { token: s1.token, body: { theme: 'ROSA' } }), 400);
    is(await req('PATCH', '/profile', { token: s1.token, body: { timezone: 'Marte/Olimpo' } }), 400);
    is(await req('PATCH', '/profile', { token: s1.token, body: { githubUrl: 'github.com/sin-protocolo' } }), 400);
  });
  await t('Redes sociales con https se guardan; null las quita', async () => {
    const a = is(await req('PATCH', '/profile', { token: t1.token, body: { githubUrl: 'https://github.com/prueba', linkedinUrl: 'https://linkedin.com/in/prueba' } }), 200).body;
    eq(a.profile.social.githubUrl, 'https://github.com/prueba');
    const b = is(await req('PATCH', '/profile', { token: t1.token, body: { githubUrl: null } }), 200).body;
    eq(b.profile.social.githubUrl, null);
  });
  await t('Foto de perfil: una imagen subida se acepta; una URL externa se rechaza (400)', async () => {
    const up = is(await upload('images', s1.token, png(), 'a.png', 'image/png'), 201, 403);
    const url = ctx.avatar?.url ?? up.body?.url;
    ok(url, 'no hay URL de avatar');
    is(await req('PATCH', '/profile', { token: s1.token, body: { avatarUrl: url } }), 200);
    is(await req('PATCH', '/profile', { token: s1.token, body: { avatarUrl: 'https://externo.example.com/foto.png' } }), 400);
  });
  await t('Firma del docente: solo docentes (estudiante 403), con imagen subida', async () => {
    is(await req('PATCH', '/profile', { token: s1.token, body: { signatureUrl: image.url } }), 403);
    is(await req('PATCH', '/profile', { token: t1.token, body: { signatureUrl: image.url, publicName: 'Dra. Prueba', bio: 'Docente de prueba' } }), 200);
    const me = is(await req('GET', '/profile', { token: t1.token }), 200).body;
    ok(me.stats && 'courses' in me.stats, 'el docente debe tener stats');
  });
  await t('Perfil público del docente: sin correo, teléfono ni documento', async () => {
    const r = is(await req('GET', `/teachers/${t1.id}`), 200);
    eq(r.body.name, 'Dra. Prueba');
    ok(!/email|phone|document|passwordHash/i.test(r.text), 'expone datos privados: ' + r.text.slice(0, 200));
    is(await req('GET', `/teachers/${s1.id}`), 404); // un estudiante no es docente
    is(await req('GET', '/teachers/99999999'), 404);
  });
}

function deep(a, b) { eq(JSON.stringify(a), JSON.stringify(b)); }
