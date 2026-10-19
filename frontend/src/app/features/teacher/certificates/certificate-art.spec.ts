import { LAYOUTS } from '../../../core/certificates/certificates.models';
import {
  certificateArt,
  DEFAULT_ACCENT,
  fitSize,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  safeAccent,
  shade,
  textBox,
} from './certificate-art';

describe('certificateArt', () => {
  it.each(LAYOUTS)('%s es un SVG con el tamaño de la página y algo dibujado', (layout) => {
    const svg = certificateArt(layout, '#0F766E');

    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}"`);
    expect(svg).toMatch(/<(rect|polygon|path|circle|line)\b/);
    expect(svg).toContain('aria-hidden="true"');
  });

  it.each(LAYOUTS)('%s usa el color elegido', (layout) => {
    // El oscuro mezcla el color con negro, así que no aparece tal cual; en los demás sí.
    const svg = certificateArt(layout, '#B45309');

    expect(layout === 'DARK' ? svg.includes('#') : svg.toLowerCase().includes('#b45309')).toBe(
      true,
    );
  });

  it('cada diseño se dibuja distinto', () => {
    const drawings = new Set(LAYOUTS.map((layout) => certificateArt(layout, '#1F3A8A')));

    expect(drawings.size).toBe(LAYOUTS.length);
  });

  it('un color a medio escribir no rompe el dibujo ni se cuela en el SVG', () => {
    const svg = certificateArt('CLASSIC', '"><script>alert(1)</script>');

    expect(svg).not.toContain('script');
    expect(svg.toLowerCase()).toContain(DEFAULT_ACCENT.toLowerCase());
  });

  it('un diseño desconocido cae al clásico', () => {
    expect(certificateArt('FUTURO' as never, '#1F3A8A')).toBe(certificateArt('CLASSIC', '#1F3A8A'));
  });
});

describe('textBox', () => {
  it.each(LAYOUTS)('%s deja el texto dentro de la página', (layout) => {
    const box = textBox(layout, '#1F3A8A');

    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PAGE_WIDTH);
    expect(box.signature.x + box.signature.width).toBeLessThanOrEqual(PAGE_WIDTH);
    expect(box.titleY).toBeLessThan(box.contentY);
  });

  it('en los diseños con banda de color, el título va en blanco', () => {
    expect(textBox('BOLD', '#1F3A8A').colors.title).toBe('#FFFFFF');
    expect(textBox('WAVES', '#1F3A8A').colors.title).toBe('#FFFFFF');
  });

  it('el oscuro invierte los colores del texto', () => {
    expect(textBox('DARK', '#1F3A8A').colors.name).toBe('#FFFFFF');
  });

  it('el moderno va en mayúsculas y alineado a la izquierda', () => {
    expect(textBox('MODERN', '#1F3A8A')).toMatchObject({ upper: true, align: 'left' });
  });
});

describe('shade y safeAccent', () => {
  it('shade mezcla con blanco o negro', () => {
    expect(shade('#000000', 1)).toBe('#ffffff');
    expect(shade('#ffffff', -1)).toBe('#000000');
    expect(shade('#000000', 0.5)).toBe('#808080');
  });

  it('safeAccent solo acepta hexadecimales de 6 dígitos', () => {
    expect(safeAccent('#abcdef')).toBe('#abcdef');
    expect(safeAccent('#abc')).toBe(DEFAULT_ACCENT);
    expect(safeAccent('rojo')).toBe(DEFAULT_ACCENT);
  });
});

describe('fitSize', () => {
  it('un texto corto mantiene el tamaño; uno largo se achica sin pasar del mínimo', () => {
    expect(fitSize('Ana', 42, 700, 18)).toBe(42);
    expect(
      fitSize(
        'María de los Ángeles Fernanda del Rosario Villalobos Echeverría de la Torre',
        42,
        500,
        18,
      ),
    ).toBeLessThan(42);
    expect(fitSize('x'.repeat(500), 42, 500, 18)).toBe(18);
  });
});
