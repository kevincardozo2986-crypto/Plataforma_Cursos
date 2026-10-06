import { isValidDocument } from './document-signature.js';

const pad = (bytes: number[], total = 64) =>
  Buffer.concat([Buffer.from(bytes), Buffer.alloc(total - bytes.length, 0x20)]);

const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ', 'latin1');
const zip = pad([0x50, 0x4b, 0x03, 0x04]);
const ole = pad([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const exe = pad([0x4d, 0x5a, 0x90, 0x00]); // "MZ": un programa de Windows

describe('isValidDocument', () => {
  it('reconoce un PDF por su firma', () => {
    expect(isValidDocument(pdf, 'pdf')).toBe(true);
  });

  it('docx, xlsx, pptx y zip son ZIP por dentro', () => {
    for (const ext of ['docx', 'xlsx', 'pptx', 'zip']) {
      expect(isValidDocument(zip, ext)).toBe(true);
    }
  });

  it('doc, xls y ppt usan el formato OLE antiguo', () => {
    for (const ext of ['doc', 'xls', 'ppt']) {
      expect(isValidDocument(ole, ext)).toBe(true);
    }
  });

  it('un texto plano es válido, con tildes y saltos de línea', () => {
    expect(isValidDocument(Buffer.from('Hola, mundo\r\nSegunda línea\tcon tab'), 'txt')).toBe(true);
  });

  it('un programa renombrado no pasa como documento', () => {
    for (const ext of ['pdf', 'docx', 'zip', 'doc', 'txt']) {
      expect(isValidDocument(exe, ext)).toBe(false);
    }
  });

  it('un binario disfrazado de .txt se rechaza (bytes nulos o de control)', () => {
    expect(isValidDocument(Buffer.from([0x4d, 0x5a, 0x00, 0x01, 0x02]), 'txt')).toBe(false);
  });

  it('un archivo vacío no es un .txt válido', () => {
    expect(isValidDocument(Buffer.alloc(0), 'txt')).toBe(false);
  });

  it('el contenido no coincide con la extensión', () => {
    expect(isValidDocument(zip, 'pdf')).toBe(false);
    expect(isValidDocument(pdf, 'docx')).toBe(false);
    expect(isValidDocument(ole, 'xlsx')).toBe(false);
  });

  it('una extensión no permitida se rechaza siempre', () => {
    expect(isValidDocument(pdf, 'html')).toBe(false);
    expect(isValidDocument(pdf, 'svg')).toBe(false);
    expect(isValidDocument(pdf, 'exe')).toBe(false);
  });
});
