import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

import { loadLibrary } from '../certificate-fonts/font-library.js';

import {
  CERTIFICATE_LAYOUTS,
  type CertificateContent,
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
