import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import sharp from 'sharp';

import { loadLibrary } from '../certificate-fonts/font-library.js';

import {
  CERTIFICATE_LAYOUTS,
  type CertificateContent,
  BODY_LIMIT_Y,
  fitToHeight,
  renderCertificatePdf,
  shade,
} from './certificate-pdf.js';

const content = (overrides: Partial<CertificateContent> = {}): CertificateContent => ({
  design: {
    title: 'Certificado de finalización',
    body: 'Por haber completado el curso «{{course}}» ({{hours}}), el {{date}}.',
    accentColor: '#1F3A8A',
    layout: 'CLASSIC',
  },
  studentName: 'Ana María Ruiz Pérez',
  studentDocument: '1234567890',
  courseTitle: 'Introducción a Angular',
  courseMinutes: 1200,
  instructorName: 'Laura Gómez',
  issuedAt: new Date('2026-10-09T15:00:00.000Z'),
  code: 'CC-7F3K-9QXA-B2MD',
  verifyUrl: 'http://localhost:4200/verificar/CC-7F3K-9QXA-B2MD',
  signature: null,
  ...overrides,
});

const isPdf = (buffer: Buffer) =>
  buffer.subarray(0, 5).toString('latin1') === '%PDF-' &&
  buffer.subarray(-10).toString('latin1').includes('%%EOF');

/** Número de páginas del PDF (pdfkit escribe un objeto /Type /Page por página). */
const pages = (buffer: Buffer) => (buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('renderCertificatePdf', () => {
  it('genera un PDF válido de una sola página, con el diseño clásico', async () => {
    const pdf = await renderCertificatePdf(content());

    expect(isPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1500);
    expect(pages(pdf)).toBe(1);
  });

  it('también con el diseño moderno', async () => {
    const pdf = await renderCertificatePdf(content({ design: { ...content().design, layout: 'MODERN' } }));

    expect(isPdf(pdf)).toBe(true);
    expect(pages(pdf)).toBe(1);
  });

  it('incluye la firma cuando hay una imagen, y el archivo crece', async () => {
    const signature = await sharp({ create: { width: 700, height: 430, channels: 4, background: { r: 20, g: 20, b: 120, alpha: 0.6 } } }).png().toBuffer();

    const without = await renderCertificatePdf(content());
    const withSignature = await renderCertificatePdf(content({ signature }));

    expect(isPdf(withSignature)).toBe(true);
    expect(withSignature.length).toBeGreaterThan(without.length);
  });

  it('una "firma" que no es una imagen no impide emitir el certificado', async () => {
    const pdf = await renderCertificatePdf(content({ signature: Buffer.from('esto no es una imagen') }));

    expect(isPdf(pdf)).toBe(true);
  });

  it('la vista previa y el revocado agregan una marca de agua', async () => {
    const plain = await renderCertificatePdf(content());
    const preview = await renderCertificatePdf(content({ preview: true }));
    const revoked = await renderCertificatePdf(content({ revoked: true }));

    expect(isPdf(preview) && isPdf(revoked)).toBe(true);
    expect(preview.length).not.toBe(plain.length);
    expect(revoked.length).not.toBe(plain.length);
  });

  it('un nombre larguísimo y un curso largo no rompen ni agregan páginas', async () => {
    const pdf = await renderCertificatePdf(
      content({
        studentName: 'María de los Ángeles Fernanda del Rosario Villalobos Echeverría de la Torre',
        courseTitle: 'Introducción avanzada a la programación de aplicaciones web modernas con frameworks reactivos'.repeat(2),
        design: { ...content().design, title: 'Certificado de finalización y aprovechamiento satisfactorio del curso' },
      }),
    );

    expect(isPdf(pdf)).toBe(true);
    expect(pages(pdf)).toBe(1);
  });

  it('un curso sin duración ni tildes raras sigue generando el PDF', async () => {
    const pdf = await renderCertificatePdf(content({ courseMinutes: null, courseTitle: 'Ñandú & Co. <script>', studentName: 'José Núñez' }));

    expect(isPdf(pdf)).toBe(true);
  });

  it('cada llamada devuelve un PDF independiente', async () => {
    const [a, b] = await Promise.all([renderCertificatePdf(content()), renderCertificatePdf(content({ studentName: 'Otro Nombre' }))]);

    expect(isPdf(a) && isPdf(b)).toBe(true);
  });
});

describe('todos los diseños', () => {
  it.each(CERTIFICATE_LAYOUTS)('%s genera un PDF válido de una sola página, con y sin firma', async (layout) => {
    const signature = await sharp({ create: { width: 700, height: 430, channels: 4, background: { r: 20, g: 20, b: 120, alpha: 0.6 } } }).png().toBuffer();

    for (const withSignature of [null, signature]) {
      const pdf = await renderCertificatePdf(content({ signature: withSignature, design: { ...content().design, layout } }));

      expect(isPdf(pdf)).toBe(true);
      expect(pages(pdf)).toBe(1);
    }
  });

  it('con las tipografías del PDF (Helvetica y Times) no incrusta nada', async () => {
    const times = { regular: 'Times-Roman', bold: 'Times-Bold' };
    const pdf = await renderCertificatePdf(content(), { heading: times, body: times });

    expect(isPdf(pdf)).toBe(true);
    expect(pdf.toString('latin1')).toContain('Times');
  });

  it('un certificado emitido antes de que existiera la tipografía sigue generándose (sin font)', async () => {
    const { font: _omitted, ...old } = { ...content().design, font: 'SANS' as const };

    expect(isPdf(await renderCertificatePdf(content({ design: old })))).toBe(true);
  });

  it('un diseño desconocido cae al clásico en vez de romper', async () => {
    const design = { ...content().design, layout: 'FUTURO' as never };

    expect(isPdf(await renderCertificatePdf(content({ design })))).toBe(true);
  });

  it('marca de agua de revocado en cada diseño', async () => {
    for (const layout of CERTIFICATE_LAYOUTS) {
      const pdf = await renderCertificatePdf(content({ revoked: true, design: { ...content().design, layout } }));

      expect(isPdf(pdf)).toBe(true);
    }
  });
});

describe('shade', () => {
  it('aclara hacia blanco y oscurece hacia negro', () => {
    expect(shade('#000000', 1)).toBe('#ffffff');
    expect(shade('#ffffff', -1)).toBe('#000000');
    expect(shade('#1F3A8A', 0)).toBe('#1f3a8a');
  });

  it('a medio camino es el punto medio', () => {
    expect(shade('#000000', 0.5)).toBe('#808080');
  });
});

describe('documento del estudiante', () => {
  it('con y sin documento genera un PDF válido de una página en todos los diseños', async () => {
    for (const layout of CERTIFICATE_LAYOUTS) {
      for (const studentDocument of ['1234567890', null, undefined, 'AB-123']) {
        const pdf = await renderCertificatePdf(content({ studentDocument, design: { ...content().design, layout } }));

        expect(isPdf(pdf)).toBe(true);
        expect(pages(pdf)).toBe(1);
      }
    }
  });

  it('el documento agrega una línea de texto al PDF', async () => {
    const withDocument = await renderCertificatePdf(content());
    const without = await renderCertificatePdf(content({ studentDocument: null }));

    expect(withDocument.length).toBeGreaterThan(without.length);
  });
});

describe('tipografías de la biblioteca', () => {
  const file = (name: string) => readFileSync(join(process.cwd(), 'assets', 'certificate-fonts', name));
  const source = (font: { regular: string; bold: string | null }) => ({
    regular: file(font.regular),
    bold: font.bold ? file(font.bold) : file(font.regular),
  });

  it.each(loadLibrary().map((font) => [font.label, font] as const))(
    '%s genera un PDF válido de una página, con acentos y «», e incrusta la fuente',
    async (_label, font) => {
      const pdf = await renderCertificatePdf(
        content({
          studentName: 'José Ángel Núñez Pérez',
          design: { ...content().design, body: 'Por haber completado el curso «{{course}}» con éxito, ¡felicidades!' },
        }),
        { heading: source(font), body: source(font) },
      );

      expect(isPdf(pdf)).toBe(true);
      expect(pages(pdf)).toBe(1);
      expect(pdf.toString('latin1')).toContain('/FontFile');
    },
  );

  it('se pueden mezclar: títulos en una y texto en otra', async () => {
    const [script, serif] = [loadLibrary().find((f) => f.key === 'great-vibes')!, loadLibrary().find((f) => f.key === 'lora')!];
    const pdf = await renderCertificatePdf(content(), { heading: source(script), body: source(serif) });

    expect(isPdf(pdf)).toBe(true);
    expect((pdf.toString('latin1').match(/\/FontFile/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('un nombre larguísimo con una tipografía ancha se achica y no agrega páginas', async () => {
    const wide = loadLibrary().find((f) => f.key === 'abril-fatface')!;
    const pdf = await renderCertificatePdf(
      content({ studentName: 'María de los Ángeles Fernanda del Rosario Villalobos Echeverría de la Torre' }),
      { heading: source(wide), body: source(wide) },
    );

    expect(pages(pdf)).toBe(1);
  });

  it('si negrita y normal son el mismo archivo, se incrusta una sola vez', async () => {
    const script = loadLibrary().find((f) => f.key === 'great-vibes')!;
    const buffer = file(script.regular);
    const pdf = await renderCertificatePdf(content(), {
      heading: { regular: buffer, bold: buffer },
      body: { regular: 'Helvetica', bold: 'Helvetica-Bold' },
    });

    expect((pdf.toString('latin1').match(/\/FontFile/g) ?? []).length).toBe(1);
  });
});

describe('estilo de los textos', () => {
  const file = (name: string) => readFileSync(join(process.cwd(), 'assets', 'certificate-fonts', name));
  const noBold = () => {
    const regular = file('great-vibes-regular.woff');

    return { regular, bold: regular };
  };
  const withStyle = (style: object, overrides: Partial<CertificateContent> = {}) =>
    content({ ...overrides, design: { ...content().design, style } });

  it('un diseño con estilo genera un PDF válido de una página en todos los diseños', async () => {
    const style = {
      title: { bold: false, italic: true, size: 120, color: '#B91C1C' },
      name: { italic: true, size: 140 },
      body: { bold: true, italic: true, size: 70, color: '#0F766E' },
      showDocument: false,
    };

    for (const layout of CERTIFICATE_LAYOUTS) {
      const pdf = await renderCertificatePdf(withStyle(style, { design: { ...content().design, layout, style } }));

      expect(isPdf(pdf)).toBe(true);
      expect(pages(pdf)).toBe(1);
    }
  });

  it('la negrita sintética (en una tipografía sin negrita) cambia el dibujo', async () => {
    const fonts = { heading: noBold(), body: noBold() };
    const plain = await renderCertificatePdf(withStyle({}), fonts);
    const bold = await renderCertificatePdf(withStyle({ title: { bold: true }, name: { bold: true }, body: { bold: true } }), fonts);

    expect(isPdf(bold)).toBe(true);
    expect(bold.equals(plain)).toBe(false);
  });

  it('en una tipografía sin negrita, la automática no finge nada: queda igual que sin estilo', async () => {
    const fonts = { heading: noBold(), body: noBold() };

    // `bold: null` = automática, y la automática solo usa la negrita si es real.
    expect((await renderCertificatePdf(withStyle({ title: { bold: null } }), fonts)).length).toBe((await renderCertificatePdf(withStyle({}), fonts)).length);
  });

  it('la cursiva, el tamaño, el color y ocultar la cédula cambian el PDF', async () => {
    const base = await renderCertificatePdf(withStyle({}));

    for (const style of [{ title: { italic: true } }, { name: { size: 80 } }, { body: { size: 130 } }, { name: { color: '#FF0000' } }, { showDocument: false }]) {
      const pdf = await renderCertificatePdf(withStyle(style));

      expect(isPdf(pdf)).toBe(true);
      expect(pdf.equals(base)).toBe(false);
    }
  });

  it('con la cédula oculta no se dibuja esa línea (el PDF pesa menos)', async () => {
    const shown = await renderCertificatePdf(withStyle({}));
    const hidden = await renderCertificatePdf(withStyle({ showDocument: false }));

    expect(hidden.length).toBeLessThan(shown.length);
  });

  it('un nombre larguísimo al 140% se achica sin salirse ni agregar páginas', async () => {
    const pdf = await renderCertificatePdf(
      withStyle({ name: { size: 140, italic: true, bold: true } }, { studentName: 'María de los Ángeles Fernanda del Rosario Villalobos Echeverría de la Torre' }),
    );

    expect(pages(pdf)).toBe(1);
  });

  it('un texto largo en cursiva (varios renglones) sigue en una página', async () => {
    const body = 'Por haber completado satisfactoriamente el curso «{{course}}» con una duración de {{hours}}, '.repeat(4);
    const pdf = await renderCertificatePdf(content({ design: { ...content().design, body, style: { body: { italic: true, size: 110 } } } }));

    expect(pages(pdf)).toBe(1);
  });

  it('un estilo con valores inventados no rompe el certificado (el servicio los limpia, y aquí se ignoran)', async () => {
    const pdf = await renderCertificatePdf(withStyle({ title: { color: 'rojo', size: 99999 }, name: { bold: 'si' } }));

    expect(isPdf(pdf)).toBe(true);
  });
});

describe('fitToHeight', () => {
  const lines = (size: number) => 10 * size; // un bloque que mide 10 veces su tamaño

  it('si cabe, deja el tamaño inicial', () => {
    expect(fitToHeight(16, 9, 100, 400, lines)).toBe(16);
  });

  it('si no cabe, lo achica hasta que quepa, de medio en medio punto', () => {
    const size = fitToHeight(16, 9, 300, 400, lines);

    expect(size).toBeLessThan(16);
    expect(300 + lines(size)).toBeLessThanOrEqual(400);
    expect(300 + lines(size + 0.5)).toBeGreaterThan(400);
  });

  it('nunca baja del mínimo', () => {
    expect(fitToHeight(16, 9, 300, 310, lines)).toBe(9);
  });

  it('un texto larguísimo o muy grande ya no se monta sobre la firma (sigue en una página)', async () => {
    const long = 'Por haber completado satisfactoriamente el curso «{{course}}» con muy buen desempeño, '.repeat(12);
    const pdf = await renderCertificatePdf(content({ design: { ...content().design, body: long, style: { body: { size: 140 }, name: { size: 140 } } } }));

    expect(isPdf(pdf)).toBe(true);
    expect(pages(pdf)).toBe(1);
    expect(BODY_LIMIT_Y).toBeLessThan(462);
  });
});


describe('diseño con imagen propia', () => {
  const background = () =>
    sharp({ create: { width: 800, height: 566, channels: 3, background: { r: 30, g: 90, b: 160 } } })
      .jpeg()
      .toBuffer();

  it('IMAGE es uno de los diseños', () => {
    expect(CERTIFICATE_LAYOUTS).toContain('IMAGE');
  });

  it('dibuja la imagen a página completa y sigue siendo de una sola página', async () => {
    const withImage = await renderCertificatePdf(
      content({ design: { ...content().design, layout: 'IMAGE', backgroundUrl: '/api/uploads/x.png' }, background: await background() }),
    );
    const without = await renderCertificatePdf(content({ design: { ...content().design, layout: 'IMAGE' } }));

    expect(isPdf(withImage)).toBe(true);
    expect(pages(withImage)).toBe(1);
    expect(withImage.length).toBeGreaterThan(without.length);
    expect(withImage.toString('latin1')).toContain('/Subtype /Image');
    expect(without.toString('latin1')).not.toContain('/Subtype /Image');
  });

  it('sin imagen (no se pudo leer) sale igual, sobre fondo blanco', async () => {
    const pdf = await renderCertificatePdf(content({ design: { ...content().design, layout: 'IMAGE' }, background: null }));

    expect(isPdf(pdf)).toBe(true);
    expect(pages(pdf)).toBe(1);
  });

  it('el velo agrega una capa semitransparente detrás del texto', async () => {
    const design = { ...content().design, layout: 'IMAGE' as const };
    const plain = await renderCertificatePdf(content({ design, background: await background() }));
    const veiled = await renderCertificatePdf(content({ design: { ...design, style: { veil: 60 } }, background: await background() }));

    expect(veiled.toString('latin1')).toMatch(/\/ca 0\.6/);
    expect(plain.toString('latin1')).not.toMatch(/\/ca 0\.6/);
    expect(pages(veiled)).toBe(1);
  });
});


/** Lo que dibuja la página (los flujos comprimidos del PDF, ya abiertos): sirve para comparar sin las fechas. */
const drawn = (pdf: Buffer): string => {
  const text = pdf.toString('latin1');
  const out: string[] = [];

  for (const match of text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      out.push(inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'));
    } catch {
      /* Fuentes e imágenes no son flujos de dibujo. */
    }
  }

  return out.join('\n');
};

describe('mover los textos', () => {
  const withOffsets = (offsets: object) => content({ design: { ...content().design, style: { offsets } } });

  it('sin mover (o con ceros) el PDF es idéntico al de siempre', async () => {
    const plain = await renderCertificatePdf(content());
    const zero = await renderCertificatePdf(withOffsets({}));

    expect(drawn(zero)).toBe(drawn(plain));
  });

  it.each(['title', 'recipient', 'body', 'signature'])('mover «%s» cambia el PDF y sigue en una página', async (part) => {
    const plain = await renderCertificatePdf(content());
    const moved = await renderCertificatePdf(withOffsets({ [part]: { x: 40, y: 25 } }));

    expect(isPdf(moved)).toBe(true);
    expect(pages(moved)).toBe(1);
    expect(drawn(moved)).not.toBe(drawn(plain));
  });

  it('funciona con la firma, un nombre largo y el texto inclinado', async () => {
    const signature = await sharp({ create: { width: 200, height: 80, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.6 } } }).png().toBuffer();
    const pdf = await renderCertificatePdf(
      content({
        signature,
        studentName: 'María de los Ángeles Fernanda del Rosario Villalobos',
        design: { ...content().design, style: { body: { italic: true }, offsets: { body: { x: -30, y: 40 }, signature: { x: 60, y: -20 }, title: { x: 0, y: -10 } } } },
      }),
    );

    expect(isPdf(pdf)).toBe(true);
    expect(pages(pdf)).toBe(1);
  });

  it('un texto movido hacia abajo se achica para no pasar de la firma (que se corre con él)', async () => {
    const long = 'Por haber completado satisfactoriamente el curso «{{course}}» con muy buen desempeño, '.repeat(6);
    const pdf = await renderCertificatePdf(
      content({ design: { ...content().design, body: long, style: { offsets: { body: { x: 0, y: 60 }, signature: { x: 0, y: 20 } } } } }),
    );

    expect(isPdf(pdf)).toBe(true);
    expect(pages(pdf)).toBe(1);
  });
});
