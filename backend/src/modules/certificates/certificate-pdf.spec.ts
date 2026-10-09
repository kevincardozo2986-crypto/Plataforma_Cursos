import sharp from 'sharp';

import { type CertificateContent, renderCertificatePdf } from './certificate-pdf.js';

const content = (overrides: Partial<CertificateContent> = {}): CertificateContent => ({
  design: {
    title: 'Certificado de finalización',
    body: 'Por haber completado el curso «{{course}}» ({{hours}}), el {{date}}.',
    accentColor: '#1F3A8A',
    layout: 'CLASSIC',
  },
  studentName: 'Ana María Ruiz Pérez',
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
