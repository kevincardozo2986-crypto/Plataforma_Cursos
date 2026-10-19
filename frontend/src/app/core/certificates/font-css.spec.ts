import { cssFamily, cssWeight, familyName, fitToWidth, fontFileProblem } from './font-css';

describe('familyName', () => {
  it('es un nombre seguro para CSS', () => {
    expect(familyName('playfair-display')).toBe('cf-playfair-display');
    expect(familyName('custom:12')).toBe('cf-custom-12');
    expect(familyName("x'; color: red")).toBe('cf-x---color--red');
  });
});

describe('cssFamily', () => {
  it('Helvetica y Times usan las del sistema', () => {
    expect(cssFamily({ key: 'SANS', category: 'Sans' })).toBe('Helvetica, Arial, sans-serif');
    expect(cssFamily({ key: 'SERIF', category: 'Serif' })).toContain('Times');
  });

  it('las demás llevan su nombre registrado y una parecida de respaldo', () => {
    expect(cssFamily({ key: 'great-vibes', category: 'Cursiva' })).toBe(
      "'cf-great-vibes', cursive",
    );
    expect(cssFamily({ key: 'lora', category: 'Serif' })).toBe(
      "'cf-lora', 'Times New Roman', Times, serif",
    );
    expect(cssFamily({ key: 'custom:3', category: 'Mía' })).toContain("'cf-custom-3'");
  });

  it('sin tipografía (el catálogo aún no carga) queda Helvetica', () => {
    expect(cssFamily(undefined)).toBe('Helvetica, Arial, sans-serif');
  });
});

describe('cssWeight', () => {
  it('negrita solo si la tipografía la tiene', () => {
    expect(cssWeight({ hasBold: true }, true)).toBe(700);
    expect(cssWeight({ hasBold: false }, true)).toBe(400);
    expect(cssWeight({ hasBold: true }, false)).toBe(400);
  });

  it('sin saber nada, pide negrita (Helvetica la tiene)', () => {
    expect(cssWeight(undefined, true)).toBe(700);
  });
});

describe('fitToWidth', () => {
  const width = (perChar: number, text: string) => (size: number) => text.length * size * perChar;

  it('si cabe, deja el tamaño inicial', () => {
    expect(fitToWidth(42, 700, 18, width(0.5, 'Ana'))).toBe(42);
  });

  it('si no cabe, lo achica hasta que quepa', () => {
    const size = fitToWidth(42, 400, 18, width(0.5, 'a'.repeat(30)));

    expect(size).toBeLessThan(42);
    expect(width(0.5, 'a'.repeat(30))(size)).toBeLessThanOrEqual(400);
    expect(width(0.5, 'a'.repeat(30))(size + 1)).toBeGreaterThan(400);
  });

  it('nunca baja del mínimo', () => {
    expect(fitToWidth(42, 10, 18, width(1, 'x'.repeat(100)))).toBe(18);
  });
});

describe('fontFileProblem', () => {
  it.each(['a.ttf', 'A.OTF', 'x.woff', 'x.woff2', 'Mi Fuente.TTF'])('acepta %s', (name) => {
    expect(fontFileProblem({ name, size: 50_000 })).toBeNull();
  });

  it.each(['foto.png', 'doc.pdf', 'a.ttf.exe', 'x.ttc', 'sin-extension', 'a.woff3'])(
    'rechaza %s',
    (name) => {
      expect(fontFileProblem({ name, size: 50_000 })).toContain('Elige un archivo');
    },
  );

  it('rechaza lo vacío y lo de más de 2 MB', () => {
    expect(fontFileProblem({ name: 'a.ttf', size: 0 })).toContain('vacío');
    expect(fontFileProblem({ name: 'a.ttf', size: 2 * 1024 * 1024 + 1 })).toContain('demasiado');
    expect(fontFileProblem({ name: 'a.ttf', size: 2 * 1024 * 1024 })).toBeNull();
  });
});
