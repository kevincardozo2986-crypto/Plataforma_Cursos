import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import type { CertificateFontsRepository } from './certificate-fonts.repository.js';
import { CertificateFontsService } from './certificate-fonts.service.js';
import { fontsDir } from './font-library.js';

const owner = { id: 7, role: Role.TEACHER } as AuthenticatedUser;
const other = { id: 8, role: Role.TEACHER } as AuthenticatedUser;
const admin = { id: 1, role: Role.ADMIN } as AuthenticatedUser;

const woff = () => readFileSync(join(fontsDir(), 'lora-regular.woff'));

let dir: string;
let previous: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fonts-'));
  previous = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = dir;
});

afterEach(() => {
  process.env.UPLOADS_DIR = previous;
  rmSync(dir, { recursive: true, force: true });
});

function build() {
  const rows = new Map<number, { id: number; name: string; fileName: string; ownerId: number }>();
  let next = 1;
  const repository = {
    listOf: vi.fn((ownerId: number) => Promise.resolve([...rows.values()].filter((r) => r.ownerId === ownerId).map(({ id, name }) => ({ id, name })))),
    find: vi.fn((id: number) => Promise.resolve(rows.get(id) ?? null)),
    count: vi.fn((ownerId: number) => Promise.resolve([...rows.values()].filter((r) => r.ownerId === ownerId).length)),
    create: vi.fn((data: { name: string; fileName: string; ownerId: number }) => {
      const row = { id: next++, ...data };
      rows.set(row.id, row);
      return Promise.resolve(row);
    }),
    delete: vi.fn((id: number) => {
      rows.delete(id);
      return Promise.resolve({});
    }),
    templatesUsing: vi.fn().mockResolvedValue(0),
    certificatesUsing: vi.fn().mockResolvedValue(0),
  };

  return { service: new CertificateFontsService(repository as unknown as CertificateFontsRepository), repository, rows };
}

const upload = (service: CertificateFontsService, user = owner, buffer = woff(), name?: string) =>
  service.upload(user, { buffer, originalname: 'Mi Fuente.woff' }, name);

describe('catálogo', () => {
  it('trae las del PDF, las de la biblioteca con sus direcciones, y solo las propias de quien consulta', async () => {
    const { service } = build();
    await upload(service, owner, woff(), 'De Laura');
    await upload(service, other, woff(), 'De otro');

    const catalog = await service.catalog(owner);

    expect(catalog.standard.map((font) => font.key)).toEqual(['SANS', 'SERIF']);
    expect(catalog.library.length).toBeGreaterThanOrEqual(20);
    expect(catalog.library[0].regularUrl).toMatch(/^\/api\/certificate-fonts\/files\/[\w-]+\.woff$/);
    expect(catalog.custom.map((font) => font.label)).toEqual(['De Laura']);
    expect(catalog.custom[0]).toMatchObject({ key: 'custom:1', regularUrl: '/api/certificate-fonts/custom/1/file', hasBold: false });
  });
});

describe('subir una tipografía propia', () => {
  it('guarda el archivo con un nombre aleatorio y devuelve su clave', async () => {
    const { service, rows } = build();

    const result = await upload(service, owner, woff(), 'Mi Lora');

    expect(result).toEqual({ id: 1, key: 'custom:1', label: 'Mi Lora' });
    expect(rows.get(1)?.fileName).toMatch(/^[a-f0-9]{32}\.woff$/);
    expect(readdirSync(join(dir, '.fonts'))).toEqual([rows.get(1)?.fileName]);
  });

  it('sin nombre usa el de la familia de la tipografía', async () => {
    const { service } = build();

    expect((await upload(service)).label).toMatch(/lora/i);
  });

  it('rechaza lo que no es una tipografía, aunque se llame .ttf', async () => {
    const { service, repository } = build();

    await expect(upload(service, owner, Buffer.from('esto es texto, no una tipografía'))).rejects.toThrow('no es una tipografía válida');
    await expect(upload(service, owner, Buffer.from('MZ\x90\x00programa'))).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rechaza un archivo dañado que solo empieza como tipografía', async () => {
    const { service } = build();

    await expect(upload(service, owner, Buffer.from('wOFF' + 'x'.repeat(300)))).rejects.toThrow('dañado');
  });

  it('rechaza lo muy pesado y la falta de archivo', async () => {
    const { service } = build();

    await expect(upload(service, owner, Buffer.alloc(2 * 1024 * 1024 + 1, 1))).rejects.toThrow('pesa demasiado');
    await expect(service.upload(owner, undefined)).rejects.toThrow('Adjunta un archivo');
  });

  it('limita a 20 tipografías propias por docente', async () => {
    const { service, repository } = build();
    repository.count.mockResolvedValue(20);

    await expect(upload(service)).rejects.toThrow('hasta 20');
  });
});

describe('descargar y borrar', () => {
  it('el dueño y un admin descargan el archivo; otro docente recibe 404', async () => {
    const { service } = build();
    await upload(service);

    expect((await service.customFile(owner, 1)).format).toBe('woff');
    await expect(service.customFile(admin, 1)).resolves.toBeDefined();
    await expect(service.customFile(other, 1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.customFile(owner, 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('borra el registro y el archivo', async () => {
    const { service, rows } = build();
    await upload(service);

    await expect(service.remove(owner, 1)).resolves.toEqual({ deleted: true });

    expect(rows.size).toBe(0);
    expect(readdirSync(join(dir, '.fonts'))).toEqual([]);
  });

  it('otro docente no puede borrarla (404)', async () => {
    const { service, rows } = build();
    await upload(service);

    await expect(service.remove(other, 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(rows.size).toBe(1);
  });

  it('no se borra si una plantilla la usa, y dice cuántas', async () => {
    const { service, repository, rows } = build();
    await upload(service);
    repository.templatesUsing.mockResolvedValue(2);

    const error = await service.remove(owner, 1).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toContain('2 plantillas');
    expect(rows.size).toBe(1);
  });

  it('tampoco si ya está en certificados emitidos (se necesita para volver a generarlos)', async () => {
    const { service, repository } = build();
    await upload(service);
    repository.certificatesUsing.mockResolvedValue(3);

    await expect(service.remove(owner, 1)).rejects.toThrow('3 certificados ya emitidos');
  });
});

describe('assertUsable', () => {
  it('las del PDF y las de la biblioteca las puede usar cualquiera', async () => {
    const { service } = build();

    for (const key of ['SANS', 'SERIF', 'playfair-display', 'great-vibes']) {
      await expect(service.assertUsable(owner, key)).resolves.toBeUndefined();
    }
  });

  it('una propia solo la usa su dueño (o un admin)', async () => {
    const { service } = build();
    await upload(service);

    await expect(service.assertUsable(owner, 'custom:1')).resolves.toBeUndefined();
    await expect(service.assertUsable(admin, 'custom:1')).resolves.toBeUndefined();
    await expect(service.assertUsable(other, 'custom:1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('una que no existe se rechaza', async () => {
    const { service } = build();

    for (const key of ['no-existe', 'custom:99', 'custom:abc', '../../.env', '']) {
      await expect(service.assertUsable(owner, key)).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});

describe('resolve (lo que usa el PDF)', () => {
  it('las del PDF van por nombre, sin archivo', async () => {
    const { service } = build();

    expect(await service.resolve('SANS')).toEqual({ regular: 'Helvetica', bold: 'Helvetica-Bold' });
    expect(await service.resolve('SERIF')).toEqual({ regular: 'Times-Roman', bold: 'Times-Bold' });
    expect(await service.resolve(undefined)).toEqual({ regular: 'Helvetica', bold: 'Helvetica-Bold' });
  });

  it('las de la biblioteca traen su archivo; sin negrita, la normal hace de negrita', async () => {
    const { service } = build();

    const lora = await service.resolve('lora');
    const script = await service.resolve('great-vibes');

    expect(Buffer.isBuffer(lora.regular) && Buffer.isBuffer(lora.bold)).toBe(true);
    expect(lora.regular).not.toBe(lora.bold);
    expect(script.bold).toBe(script.regular);
  });

  it('la propia trae su archivo', async () => {
    const { service } = build();
    await upload(service);

    const font = await service.resolve('custom:1');

    expect(Buffer.isBuffer(font.regular)).toBe(true);
    expect(font.bold).toBe(font.regular);
  });

  it('una clave desconocida o una propia ya borrada cae a Helvetica en vez de romper el certificado', async () => {
    const { service } = build();
    await upload(service);
    await service.remove(owner, 1);

    for (const key of ['custom:1', 'no-existe', 'custom:77', '../../.env']) {
      expect(await service.resolve(key)).toEqual({ regular: 'Helvetica', bold: 'Helvetica-Bold' });
    }
  });
});
