import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateCertificateTemplateDto,
  UpdateCertificateTemplateDto,
  UpdateIssuedCertificateDto,
} from './certificate.dto.js';

const errorsOf = async (cls: typeof CreateCertificateTemplateDto | typeof UpdateCertificateTemplateDto, plain: object) =>
  (await validate(plainToInstance(cls as never, plain) as object)).length;

describe('estilo en el DTO de plantillas', () => {
  it('acepta un estilo completo y válido', async () => {
    const style = {
      title: { bold: true, italic: true, size: 120, color: '#1F3A8A' },
      name: { bold: null, size: 60 },
      body: { size: 140 },
      showDocument: false,
    };

    expect(await errorsOf(CreateCertificateTemplateDto, { name: 'Plantilla', style })).toBe(0);
    expect(await errorsOf(UpdateCertificateTemplateDto, { style })).toBe(0);
  });

  it('no hace falta enviar nada del estilo', async () => {
    expect(await errorsOf(CreateCertificateTemplateDto, { name: 'Plantilla' })).toBe(0);
    expect(await errorsOf(UpdateCertificateTemplateDto, { style: {} })).toBe(0);
  });

  it.each([
    ['tamaño bajo', { title: { size: 59 } }],
    ['tamaño alto', { title: { size: 141 } }],
    ['tamaño con decimales', { name: { size: 100.5 } }],
    ['tamaño como texto', { name: { size: '120' } }],
    ['color en palabras', { body: { color: 'rojo' } }],
    ['color corto', { body: { color: '#123' } }],
    ['negrita como texto', { title: { bold: 'si' } }],
    ['cursiva como número', { title: { italic: 1 } }],
    ['mostrar cédula como texto', { showDocument: 'no' }],
  ])('rechaza %s', async (_name, style) => {
    expect(await errorsOf(CreateCertificateTemplateDto, { name: 'Plantilla', style })).toBeGreaterThan(0);
  });
});


describe('corrección de un certificado emitido (DTO)', () => {
  const check = async (plain: object) => (await validate(plainToInstance(UpdateIssuedCertificateDto, plain) as object)).length;

  it('acepta un nombre y/o un documento válidos', async () => {
    expect(await check({ studentName: 'Ana María Ruiz' })).toBe(0);
    expect(await check({ studentDocument: '1020304050' })).toBe(0);
    expect(await check({ studentName: 'Ana', studentDocument: 'AB-12345' })).toBe(0);
  });

  it('un documento vacío se convierte en null (quitarlo)', async () => {
    const dto = plainToInstance(UpdateIssuedCertificateDto, { studentDocument: '   ' });

    expect(dto.studentDocument).toBeNull();
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    ['nombre muy corto', { studentName: 'A' }],
    ['nombre larguísimo', { studentName: 'a'.repeat(121) }],
    ['documento muy corto', { studentDocument: '12' }],
    ['documento larguísimo', { studentDocument: '1'.repeat(31) }],
    ['nombre que no es texto', { studentName: 123 }],
  ])('rechaza %s', async (_name, plain) => {
    expect(await check(plain)).toBeGreaterThan(0);
  });
});


describe('imagen de fondo y velo (DTO)', () => {
  const check = async (plain: object) => (await validate(plainToInstance(CreateCertificateTemplateDto, { name: 'Mi plantilla', ...plain }))).length;

  it('acepta una imagen subida a la plataforma y null/vacío para quitarla', async () => {
    expect(await check({ layout: 'IMAGE', backgroundUrl: '/api/uploads/a1b2c3d4e5f60718293a4b5c6d7e8f90.jpg' })).toBe(0);
    expect(plainToInstance(CreateCertificateTemplateDto, { name: 'x y', backgroundUrl: '' }).backgroundUrl).toBeNull();
  });

  it.each(['https://otra-web.com/f.png', '/api/uploads/corta.png', '/api/uploads/a1b2c3d4e5f60718293a4b5c6d7e8f90.exe'])('rechaza %s', async (backgroundUrl) => {
    expect(await check({ backgroundUrl })).toBeGreaterThan(0);
  });

  it('el velo va de 0 a 80', async () => {
    expect(await check({ style: { veil: 40 } })).toBe(0);
    expect(await check({ style: { veil: 81 } })).toBeGreaterThan(0);
    expect(await check({ style: { veil: 2.5 } })).toBeGreaterThan(0);
  });
});


describe('posición de los textos (DTO)', () => {
  const check = async (plain: object) => (await validate(plainToInstance(CreateCertificateTemplateDto, { name: 'Mi plantilla', ...plain }))).length;

  it('acepta desplazamientos enteros dentro de los límites', async () => {
    expect(await check({ style: { offsets: { title: { x: 10, y: -20 }, recipient: { y: 5 }, body: { x: -400 }, signature: { x: 400, y: 300 } } } })).toBe(0);
  });

  it.each([
    { title: { x: 401 } },
    { body: { y: -301 } },
    { signature: { x: 1.5 } },
    { recipient: { y: 'abajo' } },
  ])('rechaza %j', async (offsets) => {
    expect(await check({ style: { offsets } })).toBeGreaterThan(0);
  });
});
