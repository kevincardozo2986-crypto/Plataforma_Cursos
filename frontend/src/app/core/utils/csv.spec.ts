import { describe, expect, it } from 'vitest';

import { toCsv } from './csv';

describe('toCsv', () => {
  it('empieza con la marca de orden de bytes y separa con punto y coma, con saltos de Windows', () => {
    const csv = toCsv(
      ['Nombre', 'Nota'],
      [
        ['Ana', 90],
        ['Luis', null],
      ],
    );

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('Nombre;Nota\r\nAna;90\r\nLuis;\r\n');
  });

  it('entrecomilla lo que trae separador, comillas o saltos de línea', () => {
    const csv = toCsv(['Texto'], [['a;b'], ['dijo "hola"'], ['dos\nlíneas']]);

    expect(csv).toContain('"a;b"');
    expect(csv).toContain('"dijo ""hola"""');
    expect(csv).toContain('"dos\nlíneas"');
  });

  it('conserva tildes y la ñ', () => {
    expect(toCsv(['Año'], [['Peña, José']])).toContain('Año');
    expect(toCsv(['Año'], [['Peña, José']])).toContain('Peña, José');
  });

  it('neutraliza las celdas que Excel tomaría como fórmula, pero deja los números negativos', () => {
    const csv = toCsv(['x'], [['=SUMA(A1)'], ['+cmd'], ['@algo'], ['-5'], [-3]]);

    expect(csv).toContain("'=SUMA(A1)");
    expect(csv).toContain("'+cmd");
    expect(csv).toContain("'@algo");
    expect(csv).toContain('\r\n-5\r\n');
    expect(csv).toContain('\r\n-3\r\n');
  });
});
