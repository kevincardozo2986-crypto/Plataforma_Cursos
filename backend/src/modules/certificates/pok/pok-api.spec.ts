import { createHmac } from 'node:crypto';

import {
  advanceStatus,
  buildCredentialBody,
  buildPreviewBody,
  credentialIdOf,
  organizationOf,
  PokClient,
  pokConfig,
  previewUrlOf,
  statusFromState,
  templatesOf,
  verifyWebhook,
  customParametersFor,
  documentParameters,
  parametersOf,
} from './pok-api.js';

const config = {
  apiKey: 'k-123',
  baseUrl: 'https://api.pok.tech',
  emitter: 'Universidad Santo Tomás',
  languageTag: 'es-AR',
  saveAsDraft: false,
  skipEmissionEmail: true,
  skipAcceptance: true,
};

const input = {
  code: 'CC-AAAA-BBBB-CCCC',
  courseId: 7,
  courseTitle: '  Introducción   a Angular ',
  issuedAt: new Date('2026-11-04T15:00:00.000Z'),
  firstName: 'Ana',
  lastName: 'Ruiz',
  email: 'ana@correo.com',
  document: '123456',
};

describe('pokConfig', () => {
  it('está apagado sin la clave (el diseño lo elige cada curso, no el servidor)', () => {
    expect(pokConfig({})).toBeNull();
    expect(pokConfig({ POK_TEMPLATE_ID: 'x' })).toBeNull();
    expect(pokConfig({ POK_API_KEY: 'x' })).not.toBeNull();
  });

  it('por defecto la emisión es directa y silenciosa (sin borrador, sin correo, sin aceptación)', () => {
    expect(pokConfig({ POK_API_KEY: 'k' })).toMatchObject({ saveAsDraft: false, skipEmissionEmail: true, skipAcceptance: true });
  });

  it('cada interruptor se puede apagar o encender desde el .env', () => {
    expect(pokConfig({ POK_API_KEY: 'k', POK_SKIP_EMISSION_EMAIL: 'false', POK_SKIP_ACCEPTANCE: 'false', POK_SAVE_AS_DRAFT: 'true' })).toMatchObject({
      saveAsDraft: true,
      skipEmissionEmail: false,
      skipAcceptance: false,
    });
  });

  it('usa valores por defecto y entiende los interruptores', () => {
    const cfg = pokConfig({ POK_API_KEY: ' k ', POK_TEMPLATE_ID: 't', POK_SAVE_AS_DRAFT: 'true' });

    expect(cfg).toMatchObject({
      apiKey: 'k',
      baseUrl: 'https://api.pok.tech',
      emitter: 'Campus Virtual',
      saveAsDraft: true,
      skipEmissionEmail: true,
      skipAcceptance: true,
    });
    expect(pokConfig({ POK_API_KEY: 'k', POK_TEMPLATE_ID: 't', POK_API_URL: 'https://x.test///' })?.baseUrl).toBe('https://x.test');
  });
});

describe('buildCredentialBody', () => {
  it('arma el cuerpo con el receptor, el diseño y una llave de idempotencia estable', () => {
    const body = buildCredentialBody(input, config, 'tpl-1');

    expect(body.credential).toMatchObject({
      title: 'Introducción a Angular',
      emitter: 'Universidad Santo Tomás',
      emissionType: 'pok',
      emissionDate: '2026-11-04T15:00:00.000Z',
      skipEmissionEmail: true,
      skipAcceptance: true,
      saveAsDraft: false,
      tags: ['Curso:7', 'Certificado:CC-AAAA-BBBB-CCCC'],
    });
    expect(body.receiver).toMatchObject({ firstName: 'Ana', lastName: 'Ruiz', email: 'ana@correo.com', identification: '123456' });
    expect(body.customization.template).toEqual({ id: 'tpl-1', customParameters: {} });
    expect(buildCredentialBody(input, config, 'otro').customization.template.id).toBe('otro');
    expect(body.idempotencyKey).toBe('campus-CC-AAAA-BBBB-CCCC');
    expect(buildCredentialBody(input, config, 'tpl-1').idempotencyKey).toBe(body.idempotencyKey);
  });

  it('omite el documento si no hay y recorta los textos largos', () => {
    const body = buildCredentialBody({ ...input, document: null, courseTitle: 'x'.repeat(400) }, config, 'tpl-1');

    expect(body.receiver).not.toHaveProperty('identification');
    expect(body.credential.title).toHaveLength(150);
  });
});

describe('estados', () => {
  it('traduce el estado de POK', () => {
    expect(statusFromState('ACCEPTED')).toBe('ACCEPTED');
    expect(statusFromState('emitted')).toBe('EMITTED');
    expect(statusFromState('pending')).toBe('PENDING');
    expect(statusFromState('INITIAL')).toBe('PENDING');
    expect(statusFromState('rejected')).toBe('FAILED');
    expect(statusFromState(null)).toBe('PENDING');
  });

  it('nunca retrocede', () => {
    expect(advanceStatus('ACCEPTED', 'EMITTED')).toBe('ACCEPTED');
    expect(advanceStatus('PENDING', 'EMITTED')).toBe('EMITTED');
    expect(advanceStatus('EMITTED', 'ACCEPTED')).toBe('ACCEPTED');
    expect(advanceStatus('FAILED', 'PENDING')).toBe('PENDING');
  });

  it('lee el id de la respuesta', () => {
    expect(credentialIdOf({ id: 'abc' })).toBe('abc');
    expect(credentialIdOf({ certificateId: 'z' })).toBe('z');
    expect(credentialIdOf({})).toBeNull();
    expect(credentialIdOf(null)).toBeNull();
  });
});

describe('verifyWebhook', () => {
  const rawBody = '{"id":"c1","type":"credential-accepted"}';
  const now = 1_800_000_000_000;
  const sign = (timestamp: string, key = 'clave') => createHmac('sha512', key).update(`${timestamp}.${rawBody}`).digest('hex');

  it('acepta una firma correcta y reciente', () => {
    const timestamp = String(now - 1000);

    expect(
      verifyWebhook({ rawBody, signingKey: 'clave', now, headers: { 'x-pok-request-timestamp': timestamp, 'x-pok-signature': sign(timestamp) } }),
    ).toEqual({ ok: true });
  });

  it('rechaza una firma de otra clave o un cuerpo alterado', () => {
    const timestamp = String(now);

    expect(verifyWebhook({ rawBody, signingKey: 'clave', now, headers: { 'x-pok-request-timestamp': timestamp, 'x-pok-signature': sign(timestamp, 'otra') } }).ok).toBe(false);
    expect(verifyWebhook({ rawBody: rawBody + ' ', signingKey: 'clave', now, headers: { 'x-pok-request-timestamp': timestamp, 'x-pok-signature': sign(timestamp) } }).ok).toBe(false);
  });

  it('rechaza un aviso viejo (repetición) o sin cabeceras', () => {
    const old = String(now - 10 * 60_000);

    expect(verifyWebhook({ rawBody, signingKey: 'clave', now, headers: { 'x-pok-request-timestamp': old, 'x-pok-signature': sign(old) } }).ok).toBe(false);
    expect(verifyWebhook({ rawBody, signingKey: 'clave', now, headers: {} }).ok).toBe(false);
  });

  it('acepta el secreto compartido cuando no hay clave de firma', () => {
    const good = `Basic ${Buffer.from('pok:secreto').toString('base64')}`;

    expect(verifyWebhook({ rawBody, sharedSecret: 'secreto', headers: { authorization: good } }).ok).toBe(true);
    expect(verifyWebhook({ rawBody, sharedSecret: 'secreto', headers: { authorization: 'Basic xxx' } }).ok).toBe(false);
  });

  it('sin nada configurado rechaza siempre', () => {
    expect(verifyWebhook({ rawBody, headers: {} })).toEqual({ ok: false, reason: 'El webhook no está configurado' });
  });
});

describe('PokClient.emit', () => {
  const body = buildCredentialBody(input, config, 'tpl-1');
  const reply = (status: number, data: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status }));

  it('manda la clave en Authorization y devuelve el id', async () => {
    const http = reply(202, { id: 'cred-1', state: 'pending' });
    const result = await new PokClient(config, http as unknown as typeof fetch).emit(body);

    expect(result).toEqual({ kind: 'created', id: 'cred-1', state: 'pending' });
    const [url, init] = http.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('https://api.pok.tech/credential');
    expect((init.headers as Record<string, string>).Authorization).toBe('ApiKey k-123');
    expect(JSON.parse(init.body as string).idempotencyKey).toBe('campus-CC-AAAA-BBBB-CCCC');
  });

  it('un 409 (ya emitida) no es un error', async () => {
    const result = await new PokClient(config, reply(409, { certificateId: 'cred-0' }) as unknown as typeof fetch).emit(body);

    expect(result).toEqual({ kind: 'duplicate', id: 'cred-0' });
  });

  it('un 400 devuelve el motivo y una red caída no lanza', async () => {
    const bad = await new PokClient(config, reply(400, { message: 'email inválido' }) as unknown as typeof fetch).emit(body);

    expect(bad).toEqual({ kind: 'error', status: 400, message: 'email inválido' });

    const offline = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new PokClient(config, offline as unknown as typeof fetch);

    client.retryDelayMs = 0;

    expect(await client.emit(body)).toMatchObject({ kind: 'error', status: 0 });
    expect(offline).toHaveBeenCalledTimes(3); // el intento y 2 reintentos
  });
});

describe('lectura de las respuestas de POK', () => {
  it('lee los diseños de la cuenta e ignora filas raras', () => {
    expect(
      templatesOf({ pagination: {}, data: [{ id: 'a', name: 'Art Deco', tags: ['x', 3] }, { id: 7 }, null, { id: 'b', name: 'Clásico' }] }),
    ).toEqual([
      { id: 'a', name: 'Art Deco', tags: ['x'] },
      { id: 'b', name: 'Clásico', tags: [] },
    ]);
    expect(templatesOf(null)).toEqual([]);
    expect(templatesOf({ data: 'no' })).toEqual([]);
  });

  it('lee la organización y sus créditos', () => {
    expect(organizationOf({ name: 'SANTOTOTUNJA', availableCredits: 5, wallet: '0x' })).toEqual({ name: 'SANTOTOTUNJA', availableCredits: 5 });
    expect(organizationOf({ name: 'X' })).toEqual({ name: 'X', availableCredits: 0 });
    expect(organizationOf({})).toBeNull();
  });
});

describe('PokClient: diseños', () => {
  const reply = (status: number, data: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status }));

  it('listTemplates devuelve los diseños, o null si POK falla', async () => {
    const ok = await new PokClient(config, reply(200, { data: [{ id: 'a', name: 'A' }] }) as unknown as typeof fetch).listTemplates();

    expect(ok).toEqual([{ id: 'a', name: 'A', tags: [] }]);
    expect(await new PokClient(config, reply(500, {}) as unknown as typeof fetch).listTemplates()).toBeNull();
  });

  it('findTemplate distingue "no existe" de "POK no respondió"', async () => {
    expect(await new PokClient(config, reply(200, { id: 'a', name: 'A' }) as unknown as typeof fetch).findTemplate('a')).toEqual({ found: true, id: 'a', name: 'A' });
    expect(await new PokClient(config, reply(404, {}) as unknown as typeof fetch).findTemplate('x')).toEqual({ found: false, unknown: false });
    expect(await new PokClient(config, reply(500, {}) as unknown as typeof fetch).findTemplate('x')).toEqual({ found: false, unknown: true });
    expect(await new PokClient(config, vi.fn().mockRejectedValue(new Error('red')) as unknown as typeof fetch).findTemplate('x')).toEqual({ found: false, unknown: true });
  });
});

describe('PokClient.emit: reintenta cortes de red', () => {
  const body = buildCredentialBody(input, config, 'tpl-1');

  it('si el primer intento se corta y el segundo llega, devuelve la credencial', async () => {
    const http = vi.fn().mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'cred-9', state: 'processing' }), { status: 202 }));
    const client = new PokClient(config, http as unknown as typeof fetch);

    client.retryDelayMs = 0;

    expect(await client.emit(body)).toEqual({ kind: 'created', id: 'cred-9', state: 'processing' });
    expect(http).toHaveBeenCalledTimes(2);
  });

  it('una respuesta de error de POK (400) NO se reintenta', async () => {
    const http = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'mal' }), { status: 400 }));
    const client = new PokClient(config, http as unknown as typeof fetch);

    client.retryDelayMs = 0;
    await client.emit(body);

    expect(http).toHaveBeenCalledTimes(1);
  });
});

describe('vista previa de POK', () => {
  it('el cuerpo no lleva los campos de envío ni el correo (POK los rechaza)', () => {
    const body = buildPreviewBody({ courseTitle: '  Curso   de prueba ', templateId: 'tpl-1' }, config);

    expect(body.credential).toMatchObject({ emissionType: 'pok', title: 'Curso de prueba', emitter: 'Universidad Santo Tomás' });
    expect(body.credential).not.toHaveProperty('saveAsDraft');
    expect(body.credential).not.toHaveProperty('tags');
    expect(body.credential).not.toHaveProperty('skipAcceptance');
    expect(body.receiver).not.toHaveProperty('email');
    expect(body.receiver).toMatchObject({ firstName: 'Nombre', lastName: 'del estudiante', languageTag: 'es-AR' });
    expect(body.customization.template).toEqual({ id: 'tpl-1', customParameters: {} });
  });

  it('lee la dirección de la imagen solo si es https', () => {
    expect(previewUrlOf({ url: 'https://img.example/a.png' })).toBe('https://img.example/a.png');
    expect(previewUrlOf({ url: 'http://inseguro.example/a.png' })).toBeNull();
    expect(previewUrlOf({ url: 'javascript:alert(1)' })).toBeNull();
    expect(previewUrlOf({})).toBeNull();
    expect(previewUrlOf(null)).toBeNull();
  });

  it('PokClient.preview devuelve la imagen o null si POK falla', async () => {
    const reply = (status: number, data: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status }));
    const body = buildPreviewBody({ courseTitle: 'X', templateId: 'tpl-1' }, config);

    const http = reply(200, { url: 'https://img.example/p.png' });

    expect(await new PokClient(config, http as unknown as typeof fetch).preview(body)).toBe('https://img.example/p.png');
    expect((http.mock.calls[0] as [string])[0]).toBe('https://api.pok.tech/template/preview');
    expect(await new PokClient(config, reply(400, { fields: {} }) as unknown as typeof fetch).preview(body)).toBeNull();
    expect(await new PokClient(config, vi.fn().mockRejectedValue(new Error('red')) as unknown as typeof fetch).preview(body)).toBeNull();
  });
});

describe('documento del estudiante en el diseño de POK', () => {
  const parameters = [
    { id: 'p-doc', label: 'Documento Id' },
    { id: 'p-horas', label: 'Número de horas' },
    { id: 'p-cc', label: 'C.C.' },
    { id: 'p-accion', label: 'Acción realizada' },
  ];

  it('lee los parámetros propios que trae el diseño (id y etiqueta)', () => {
    expect(parametersOf({ id: 't', customParameters: [{ id: 'a', label: 'Documento' }, { id: 5 }, null] })).toEqual([{ id: 'a', label: 'Documento' }]);
    expect(parametersOf({})).toEqual([]);
    expect(parametersOf(null)).toEqual([]);
  });

  it('pone el documento solo en los campos que lo piden, sin confundir otras etiquetas', () => {
    expect(documentParameters(parameters, ' 1098765432 ')).toEqual({ 'p-doc': '1098765432', 'p-cc': '1098765432' });
    expect(documentParameters([{ id: 'x', label: 'Cédula de ciudadanía' }, { id: 'y', label: 'Identificación' }], '55')).toEqual({ x: '55', y: '55' });
  });

  it('sin documento o sin campos de documento, no manda nada', () => {
    expect(documentParameters(parameters, null)).toEqual({});
    expect(documentParameters(parameters, '  ')).toEqual({});
    expect(documentParameters([{ id: 'h', label: 'Número de horas' }], '123')).toEqual({});
  });

  it('el cuerpo de la credencial lleva esos parámetros en customization.template.customParameters', () => {
    const config = pokConfig({ POK_API_KEY: 'k', POK_EMITTER: 'U' } as NodeJS.ProcessEnv)!;
    const body = buildCredentialBody(
      { code: 'CC-1', courseId: 1, courseTitle: 'C', issuedAt: new Date(), firstName: 'A', lastName: 'B', email: 'a@b.co', document: '123' },
      config,
      'tpl',
      { 'p-doc': '123' },
    );

    expect(body.customization.template.customParameters).toEqual({ 'p-doc': '123' });
    expect(body.receiver.identification).toBe('123');
  });
});

describe('nombre del curso en el diseño de POK', () => {
  const parameters = [
    { id: 'p-doc', label: 'Documento Id' },
    { id: 'p-curso', label: 'Curso' },
    { id: 'p-nom', label: 'Nombre del curso' },
    { id: 'p-horas', label: 'Número de horas' },
    { id: 'p-cursor', label: 'Cursor' },
  ];

  it('llena «Curso» y «Nombre del curso» con el título y «Documento Id» con el documento', () => {
    expect(customParametersFor(parameters, { document: '123', courseTitle: ' Álgebra  I ' })).toEqual({
      'p-curso': 'Álgebra I',
      'p-nom': 'Álgebra I',
      'p-doc': '123',
    });
  });

  it('sin documento solo llena el curso; sin título solo el documento; no toca otros campos', () => {
    expect(customParametersFor(parameters, { document: null, courseTitle: 'X' })).toEqual({ 'p-curso': 'X', 'p-nom': 'X' });
    expect(customParametersFor(parameters, { document: '9', courseTitle: '  ' })).toEqual({ 'p-doc': '9' });
  });

  it('un campo que pide el documento del curso no recibe el nombre del curso', () => {
    expect(customParametersFor([{ id: 'a', label: 'Documento del curso' }], { document: '5', courseTitle: 'X' })).toEqual({ a: '5' });
  });
});
