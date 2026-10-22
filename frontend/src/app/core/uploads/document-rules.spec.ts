import { describe, expect, it } from 'vitest';

import { documentKind, validateDocument } from './document-rules';

describe('validateDocument', () => {
  it.each([
    'guia.pdf',
    'Tarea.DOCX',
    'notas.xls',
    'datos.xlsx',
    'clase.pptx',
    'codigo.zip',
    'leeme.txt',
  ])('acepta %s', (name) => expect(validateDocument({ name, size: 1000 })).toBeNull());

  it.each(['virus.exe', 'imagen.png', 'sin-extension', 'macro.xlsm'])('rechaza %s', (name) =>
    expect(validateDocument({ name, size: 1000 })).toContain('debe ser'),
  );

  it('rechaza uno vacío o de más de 20 MB', () => {
    expect(validateDocument({ name: 'a.pdf', size: 0 })).toContain('vacío');
    expect(validateDocument({ name: 'a.pdf', size: 21 * 1024 * 1024 })).toContain('máximo');
    expect(validateDocument({ name: 'a.pdf', size: 20 * 1024 * 1024 })).toBeNull();
  });
});

describe('documentKind', () => {
  it('agrupa las extensiones por tipo', () => {
    expect(documentKind('a.pdf')).toBe('pdf');
    expect(documentKind('a.doc')).toBe('word');
    expect(documentKind('a.DOCX')).toBe('word');
    expect(documentKind('a.xlsx')).toBe('excel');
    expect(documentKind('a.pptx')).toBe('powerpoint');
    expect(documentKind('a.zip')).toBe('zip');
    expect(documentKind('a.txt')).toBe('text');
    expect(documentKind('a.bin')).toBe('other');
  });
});
