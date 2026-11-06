import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deflateSync, crc32 } from 'node:zlib';
import pg from 'pg';

/**
 * Utilidades de la prueba completa del sistema (API). Solo corre contra un servidor local.
 * Cada comprobación (`t`) es independiente: si una falla, las demás siguen y todo queda en el informe.
 */
export const BASE = process.env.E2E_API ?? 'http://localhost:3000';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname), 'La prueba completa solo corre contra un servidor local');

export const RUN = 'E2E' + randomUUID().replace(/-/g, '').slice(0, 8);
export const PASSWORD = 'Campus2026*';
export const results = [];
export const ctx = { run: RUN, created: { users: [], courses: [], templates: [], categories: [], uploads: [] } };
let current = '';

export function section(name) {
  current = name;
  console.log('\n=== ' + name + ' ===');
}

/** Una comprobación: pasa si `fn` no lanza. */
export async function t(name, fn) {
  try {
    await fn();
    results.push({ section: current, name, status: 'PASS' });
    console.log('PASS  ' + name);
  } catch (error) {
    const message = String(error?.message ?? error).replace(/\s+/g, ' ').slice(0, 400);
    results.push({ section: current, name, status: 'FAIL', detail: message });
    console.log('FAIL  ' + name + '\n        -> ' + message);
  }
}

/** Algo que no se puede comprobar en este entorno (y por qué). */
export function skip(name, why) {
  results.push({ section: current, name, status: 'SKIP', detail: why });
  console.log('SKIP  ' + name + ' (' + why + ')');
}

export async function req(method, path, { token, body, form, headers = {}, raw = false } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(BASE + path, { method, headers: h, body: payload, signal: AbortSignal.timeout(60000) });
  const buf = raw ? Buffer.from(await response.arrayBuffer()) : null;
  const text = raw ? '' : await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* no era JSON */ }
  return { status: response.status, body: json, text, buf, headers: response.headers };
}

/** Exige un estado HTTP (o uno de varios) y devuelve la respuesta. */
export function is(r, ...statuses) {
  assert(statuses.includes(r.status), `esperaba ${statuses.join(' o ')} y llegó ${r.status}: ${(r.text || '').slice(0, 250)}`);
  return r;
}

export const ok = assert.ok;
export const eq = assert.equal;
export const deep = assert.deepEqual;

let dbClient;
export async function db() {
  if (!dbClient) {
    const url = new URL(process.env.DATABASE_URL);
    assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'La limpieza solo corre contra la base local');
    dbClient = new pg.Client({ connectionString: process.env.DATABASE_URL.split('?')[0] });
    await dbClient.connect();
  }
  return dbClient;
}
export async function closeDb() { if (dbClient) await dbClient.end(); dbClient = undefined; }

/** Crea una cuenta por el registro público y devuelve su sesión. `role` la promueve por la base (como haría un admin). */
export async function makeUser(label, role = 'STUDENT') {
  const email = `${RUN.toLowerCase()}.${label}@example.com`;
  const document = String(Math.floor(1e9 + Math.random() * 9e9));
  const r = is(await req('POST', '/auth/register', { body: { firstName: label[0].toUpperCase() + label.slice(1), lastName: 'Prueba', email, password: PASSWORD, document } }), 201);
  ok(r.body, 'el registro no devolvió datos');
  if (role !== 'STUDENT') await (await db()).query('UPDATE users SET role=$1 WHERE email=$2', [role, email]);
  const session = await login(email);
  const user = { label, email, document, role, ...session };
  ctx.created.users.push(user.id);
  return user;
}

export async function login(identifier, password = PASSWORD) {
  const r = is(await req('POST', '/auth/login', { body: { identifier, password } }), 200, 201);
  const token = r.body.accessToken;
  ok(token, 'no hay accessToken');
  const me = is(await req('GET', '/auth/me', { token }), 200);
  return { token, id: me.body.id ?? me.body.user?.id, me: me.body };
}

// ---- Archivos de prueba generados en memoria ----

/** Un PNG válido de 64×64 de un solo color. */
export function png(color = [20, 99, 216]) {
  const w = 64, h = 64;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) raw.set(color, y * (w * 3 + 1) + 1 + x * 3);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export async function upload(kind, token, content, name, type) {
  const form = new FormData();
  form.append('file', new Blob([content], { type }), name);
  return req('POST', '/uploads/' + kind, { token, form });
}
