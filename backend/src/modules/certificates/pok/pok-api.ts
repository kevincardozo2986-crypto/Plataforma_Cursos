import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Integración con POK (https://docs.pok.tech): emite una credencial digital por cada certificado.
 * Este archivo reúne lo que no depende de Nest ni de la base de datos: configuración, el cuerpo de
 * la petición, la lectura de estados y la verificación de los webhooks.
 */

export type PokStatus = 'NONE' | 'PENDING' | 'EMITTED' | 'ACCEPTED' | 'FAILED';

export interface PokConfig {
  apiKey: string;
  baseUrl: string;
  /** Quien emite, tal como aparece en la credencial. */
  emitter: string;
  languageTag: string;
  /** Pruebas: la credencial queda en borrador en POK y no gasta créditos ni envía correos. */
  saveAsDraft: boolean;
  /** POK no envía su correo de aviso al estudiante (la plataforma ya lo notifica). */
  skipEmissionEmail: boolean;
  /** La credencial queda emitida sin que el estudiante tenga que aceptarla (ya dio su consentimiento en la plataforma). */
  skipAcceptance: boolean;
}

const truthy = (value: string | undefined) => /^(1|true|yes|si|sí)$/i.test((value ?? '').trim());

/** Un interruptor del .env: si no está escrito vale `fallback`. */
const flag = (value: string | undefined, fallback: boolean) => (value === undefined || value.trim() === '' ? fallback : truthy(value));

/** La configuración, o null si POK no está activado (falta la clave). */
export function pokConfig(env: NodeJS.ProcessEnv = process.env): PokConfig | null {
  const apiKey = env.POK_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    baseUrl: (env.POK_API_URL?.trim() || 'https://api.pok.tech').replace(/\/+$/, ''),
    emitter: env.POK_EMITTER?.trim() || 'Campus Virtual',
    languageTag: env.POK_LANGUAGE?.trim() || 'es-AR',
    // Por defecto la emisión es directa y silenciosa: sin borrador, sin correo de POK y sin aceptación.
    saveAsDraft: flag(env.POK_SAVE_AS_DRAFT, false),
    skipEmissionEmail: flag(env.POK_SKIP_EMISSION_EMAIL, true),
    skipAcceptance: flag(env.POK_SKIP_ACCEPTANCE, true),
  };
}

export interface CredentialInput {
  /** Código del certificado de la plataforma, p. ej. CC-7F3K-9QXA-B2MD. */
  code: string;
  courseId: number;
  courseTitle: string;
  issuedAt: Date;
  firstName: string;
  lastName: string;
  email: string;
  document: string | null;
}

const clean = (value: string, max: number) => value.trim().replace(/\s+/g, ' ').slice(0, max);

/** El cuerpo de `POST /credential`. La llave de idempotencia evita emitir dos veces el mismo certificado. */
export function buildCredentialBody(input: CredentialInput, config: PokConfig, templateId: string) {
  return {
    credential: {
      saveAsDraft: config.saveAsDraft,
      tags: [`Curso:${input.courseId}`, `Certificado:${input.code}`],
      skipEmissionEmail: config.skipEmissionEmail,
      skipAcceptance: config.skipAcceptance,
      emissionType: 'pok',
      dateFormat: 'dd/MM/yyyy',
      emissionDate: input.issuedAt.toISOString(),
      title: clean(input.courseTitle, 150),
      emitter: clean(config.emitter, 100),
    },
    receiver: {
      languageTag: config.languageTag,
      ...(input.document ? { identification: clean(input.document, 40) } : {}),
      email: input.email.trim(),
      lastName: clean(input.lastName, 80),
      firstName: clean(input.firstName, 80),
    },
    customization: {
      template: { id: templateId, customParameters: {} },
    },
    idempotencyKey: `campus-${input.code}`,
  };
}

/** Pasa el estado que devuelve POK (texto libre) a uno de los nuestros. */
export function statusFromState(state: string | null | undefined): PokStatus {
  const value = (state ?? '').toLowerCase();

  if (/accept/.test(value)) return 'ACCEPTED';
  if (/emit|sent|issued|complete/.test(value)) return 'EMITTED';
  if (/fail|error|reject|revok|cancel|denied/.test(value)) return 'FAILED';

  return 'PENDING';
}

const RANK: Record<PokStatus, number> = { NONE: 0, FAILED: 0, PENDING: 1, EMITTED: 2, ACCEPTED: 3 };

/** Los avisos pueden llegar desordenados: un estado nunca retrocede (aceptada no vuelve a emitida). */
export function advanceStatus(current: PokStatus, next: PokStatus): PokStatus {
  return RANK[next] >= RANK[current] ? next : current;
}

/** El id de la credencial en la respuesta de POK (la forma exacta no está documentada: se aceptan las comunes). */
export function credentialIdOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;

  const data = body as Record<string, unknown>;
  const id = data.id ?? data.credentialId ?? data.certificateId;

  return typeof id === 'string' && id ? id : null;
}

/** El estado dentro de la respuesta de `GET /credential/{id}`. */
export function stateOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;

  const data = body as Record<string, unknown>;
  const state = data.state ?? data.status;

  return typeof state === 'string' ? state : null;
}

export interface PokTemplate {
  id: string;
  name: string;
  tags: string[];
}

/** Los diseños dentro de la respuesta de `GET /template` (`{ data: [{ id, name, tags }] }`). */
export function templatesOf(body: unknown): PokTemplate[] {
  const data = typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : null;

  if (!Array.isArray(data)) return [];

  return data.flatMap((item: unknown) => {
    const row = item as { id?: unknown; name?: unknown; tags?: unknown } | null;

    return typeof row?.id === 'string' && typeof row.name === 'string'
      ? [{ id: row.id, name: row.name, tags: Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === 'string') : [] }]
      : [];
  });
}

export interface PokOrganization {
  name: string;
  availableCredits: number;
}

/** `GET /organization/me`: el nombre de la organización y sus créditos. */
export function organizationOf(body: unknown): PokOrganization | null {
  if (typeof body !== 'object' || body === null) return null;

  const data = body as { name?: unknown; availableCredits?: unknown };

  return typeof data.name === 'string'
    ? { name: data.name, availableCredits: typeof data.availableCredits === 'number' ? data.availableCredits : 0 }
    : null;
}

/** La página pública de la credencial (`viewUrl`), solo si es un enlace https. */
export function viewUrlOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;

  const url = (body as Record<string, unknown>).viewUrl;

  return typeof url === 'string' && /^https:\/\//.test(url) ? url.slice(0, 500) : null;
}

// --- Webhooks ---

/** Tolerancia entre el sello de tiempo del aviso y la hora actual (evita que repitan un aviso viejo). */
export const WEBHOOK_TOLERANCE_MS = 5 * 60_000;

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
};

export interface WebhookCheck {
  rawBody: string;
  /** Cabeceras en minúsculas. */
  headers: Record<string, string | string[] | undefined>;
  /** «Clave de firma» del webhook (POK > Webhooks > ícono de llave). */
  signingKey?: string;
  /** «Secreto compartido» del webhook, alternativa a la firma. */
  sharedSecret?: string;
  now?: number;
}

const header = (headers: WebhookCheck['headers'], name: string) => {
  const value = headers[name];

  return Array.isArray(value) ? value[0] : value;
};

/**
 * Comprueba que un aviso viene de POK. Con la clave de firma: HMAC SHA-512 de `timestamp.cuerpo` en hexadecimal
 * y sello de tiempo reciente. Sin ella, el secreto compartido (`Authorization: Basic base64("pok:secreto")`).
 * Si no hay ninguno configurado, se rechaza: nunca se acepta un aviso sin autenticar.
 */
export function verifyWebhook(check: WebhookCheck): { ok: boolean; reason?: string } {
  const now = check.now ?? Date.now();

  if (check.signingKey) {
    const timestamp = header(check.headers, 'x-pok-request-timestamp');
    const signature = header(check.headers, 'x-pok-signature');

    if (!timestamp || !signature) {
      return { ok: false, reason: 'Faltan las cabeceras de firma' };
    }

    if (!Number.isFinite(Number(timestamp)) || Math.abs(now - Number(timestamp)) > WEBHOOK_TOLERANCE_MS) {
      return { ok: false, reason: 'El sello de tiempo está fuera de tolerancia' };
    }

    const expected = createHmac('sha512', check.signingKey).update(`${timestamp}.${check.rawBody}`).digest('hex');

    return safeEqual(expected, signature.trim().toLowerCase())
      ? { ok: true }
      : { ok: false, reason: 'La firma no coincide' };
  }

  if (check.sharedSecret) {
    const expected = `Basic ${Buffer.from(`pok:${check.sharedSecret}`).toString('base64')}`;
    const received = header(check.headers, 'authorization') ?? '';

    return safeEqual(expected, received) ? { ok: true } : { ok: false, reason: 'El secreto no coincide' };
  }

  return { ok: false, reason: 'El webhook no está configurado' };
}

// --- Cliente HTTP ---

export type EmitResult =
  | { kind: 'created'; id: string; state: string | null }
  | { kind: 'duplicate'; id: string | null }
  | { kind: 'error'; status: number; message: string };

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return text;
  }
}

const messageOf = (body: unknown, fallback: string): string => {
  if (typeof body === 'string' && body) return body.slice(0, 300);

  if (typeof body === 'object' && body !== null) {
    const data = body as Record<string, unknown>;
    const text = data.message ?? data.error ?? data.detail;

    if (typeof text === 'string') return text.slice(0, 300);
    if (Array.isArray(text)) return text.join('; ').slice(0, 300);
  }

  return fallback;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class PokClient {
  /** Pausa entre reintentos por corte de red (se pone en 0 en las pruebas). */
  retryDelayMs = 1500;

  constructor(
    private readonly config: PokConfig,
    private readonly http: typeof fetch = fetch,
  ) {}

  private request(path: string, init: RequestInit = {}) {
    return this.http(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `ApiKey ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(20_000),
    });
  }

  /**
   * `POST /credential`: la emisión es asíncrona; devuelve el id y la credencial queda pendiente en POK.
   * Un corte de red se reintenta hasta 2 veces; es seguro porque la llave de idempotencia evita duplicados
   * (si la primera sí llegó, POK responde 409 y se enlaza la misma credencial).
   */
  async emit(body: ReturnType<typeof buildCredentialBody>): Promise<EmitResult> {
    let result = await this.emitOnce(body);

    for (let retry = 0; retry < 2 && result.kind === 'error' && result.status === 0; retry += 1) {
      await wait(this.retryDelayMs);
      result = await this.emitOnce(body);
    }

    return result;
  }

  private async emitOnce(body: ReturnType<typeof buildCredentialBody>): Promise<EmitResult> {
    try {
      const response = await this.request('/credential', { method: 'POST', body: JSON.stringify(body) });
      const data = await readJson(response);

      if (response.status === 409) {
        // Ya existía una credencial con esa llave: no se duplica, se enlaza con la existente.
        return { kind: 'duplicate', id: credentialIdOf(data) };
      }

      if (!response.ok) {
        return { kind: 'error', status: response.status, message: messageOf(data, `POK respondió ${response.status}`) };
      }

      const id = credentialIdOf(data);

      return id
        ? { kind: 'created', id, state: stateOf(data) }
        : { kind: 'error', status: response.status, message: 'POK no devolvió el id de la credencial' };
    } catch (error) {
      return { kind: 'error', status: 0, message: `No se pudo conectar con POK: ${(error as Error).message}` };
    }
  }

  /** `GET /template`: los diseños de la cuenta; null si POK no respondió. */
  async listTemplates(): Promise<PokTemplate[] | null> {
    try {
      const response = await this.request('/template');

      return response.ok ? templatesOf(await readJson(response)) : null;
    } catch {
      return null;
    }
  }

  /** `GET /template/{id}`: ¿existe ese diseño en la cuenta? `unknown` = POK no respondió. */
  async findTemplate(id: string): Promise<{ found: true; id: string; name: string } | { found: false; unknown: boolean }> {
    try {
      const response = await this.request(`/template/${encodeURIComponent(id)}`);

      if (response.status === 404 || response.status === 400) return { found: false, unknown: false };
      if (!response.ok) return { found: false, unknown: true };

      const data = (await readJson(response)) as { id?: unknown; name?: unknown } | null;

      return typeof data?.id === 'string'
        ? { found: true, id: data.id, name: typeof data.name === 'string' ? data.name : data.id }
        : { found: false, unknown: true };
    } catch {
      return { found: false, unknown: true };
    }
  }

  /** `GET /organization/me`; null si no se pudo consultar. */
  async organization(): Promise<PokOrganization | null> {
    try {
      const response = await this.request('/organization/me');

      return response.ok ? organizationOf(await readJson(response)) : null;
    } catch {
      return null;
    }
  }

  /** `GET /credential/{id}`; null si no se pudo consultar. */
  async get(id: string): Promise<unknown | null> {
    try {
      const response = await this.request(`/credential/${encodeURIComponent(id)}`);

      return response.ok ? await readJson(response) : null;
    } catch {
      return null;
    }
  }
}
