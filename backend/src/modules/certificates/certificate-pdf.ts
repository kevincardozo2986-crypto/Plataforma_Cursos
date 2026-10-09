import PDFDocument from 'pdfkit';

import {
  fillTemplate,
  formatHours,
  formatLongDate,
  type Placeholder,
} from './certificate-text.js';

export type CertificateLayout = 'CLASSIC' | 'MODERN';

/** El diseño de un certificado, tal como se guarda al emitirlo. */
export interface CertificateDesign {
  title: string;
  body: string;
  accentColor: string;
  layout: CertificateLayout;
}

export interface CertificateContent {
  design: CertificateDesign;
  studentName: string;
  courseTitle: string;
  courseMinutes: number | null;
  instructorName: string;
  issuedAt: Date;
  code: string;
  /** Dirección donde cualquiera puede comprobar el certificado. */
  verifyUrl: string;
  /** Imagen de la firma (PNG o JPG) ya leída, o null si el docente no la tiene. */
  signature: Buffer | null;
  /** Marca "VISTA PREVIA": el certificado de ejemplo que ve el docente al diseñar la plantilla. */
  preview?: boolean;
  /** Marca "REVOCADO". */
  revoked?: boolean;
}

// A4 horizontal, en puntos.
const WIDTH = 841.89;
const HEIGHT = 595.28;

const GRAY = '#4B5563';
const LIGHT = '#9CA3AF';

/** Achica la letra hasta que el texto quepa en `maxWidth` (con un mínimo, para no ser ilegible). */
function fitFontSize(
  doc: PDFKit.PDFDocument,
  text: string,
  font: string,
  start: number,
  maxWidth: number,
  min = 16,
): number {
  let size = start;

  doc.font(font);

  while (size > min && doc.fontSize(size).widthOfString(text) > maxWidth) {
    size -= 1;
  }

  return size;
}

function watermark(doc: PDFKit.PDFDocument, text: string, color: string) {
  doc.save();
  doc.rotate(-30, { origin: [WIDTH / 2, HEIGHT / 2] });
  doc.fillColor(color).fillOpacity(0.13).font('Helvetica-Bold').fontSize(96);
  doc.text(text, 0, HEIGHT / 2 - 48, { width: WIDTH, align: 'center', lineBreak: false });
  doc.restore();
}

/** Firma sobre una línea, con el nombre del docente debajo. `x` y `width` fijan la caja. */
function signatureBlock(
  doc: PDFKit.PDFDocument,
  content: CertificateContent,
  x: number,
  y: number,
  width: number,
) {
  if (content.signature) {
    try {
      doc.image(content.signature, x + width / 2 - 85, y - 72, {
        fit: [170, 66],
        align: 'center',
        valign: 'bottom',
      });
    } catch {
      /* Una imagen que pdfkit no entienda no debe impedir emitir el certificado. */
    }
  }

  doc.lineWidth(0.8).strokeColor('#374151').moveTo(x, y).lineTo(x + width, y).stroke();
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12);
  doc.text(content.instructorName, x, y + 6, { width, align: 'center', lineBreak: false });
  doc.fillColor(GRAY).font('Helvetica').fontSize(9.5);
  doc.text('Docente', x, y + 22, { width, align: 'center', lineBreak: false });
}

function footer(doc: PDFKit.PDFDocument, content: CertificateContent, x: number, width: number) {
  doc.fillColor(LIGHT).font('Helvetica').fontSize(8.5);
  doc.text(
    `Código de verificación: ${content.code}   ·   ${content.verifyUrl}`,
    x,
    HEIGHT - 44,
    { width, align: 'center', lineBreak: false },
  );
}

function bodyText(content: CertificateContent): string {
  const values: Record<Placeholder, string> = {
    student: content.studentName,
    course: content.courseTitle,
    date: formatLongDate(content.issuedAt),
    hours: formatHours(content.courseMinutes),
    instructor: content.instructorName,
  };

  return fillTemplate(content.design.body, values);
}

function classic(doc: PDFKit.PDFDocument, content: CertificateContent) {
  const { accentColor, title } = content.design;
  const inner = 70;
  const width = WIDTH - inner * 2;

  doc.lineWidth(7).strokeColor(accentColor).rect(22, 22, WIDTH - 44, HEIGHT - 44).stroke();
  doc.lineWidth(1).strokeColor(accentColor).rect(36, 36, WIDTH - 72, HEIGHT - 72).stroke();

  doc.fillColor(accentColor).font('Helvetica-Bold');
  const titleSize = fitFontSize(doc, title, 'Helvetica-Bold', 34, width, 20);
  doc.fontSize(titleSize).text(title, inner, 84, { width, align: 'center', lineBreak: false });

  doc.fillColor(GRAY).font('Helvetica').fontSize(14);
  doc.text('Se otorga a', inner, 150, { width, align: 'center', lineBreak: false });

  const nameSize = fitFontSize(doc, content.studentName, 'Helvetica-Bold', 42, width, 18);
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(nameSize);
  doc.text(content.studentName, inner, 182, { width, align: 'center', lineBreak: false });

  doc.lineWidth(1.2).strokeColor(accentColor).moveTo(WIDTH / 2 - 130, 244).lineTo(WIDTH / 2 + 130, 244).stroke();

  doc.fillColor('#1F2937').font('Helvetica').fontSize(16);
  doc.text(bodyText(content), inner + 20, 268, { width: width - 40, align: 'center', lineGap: 5 });

  signatureBlock(doc, content, WIDTH / 2 - 120, 462, 240);
  footer(doc, content, inner, width);
}

function modern(doc: PDFKit.PDFDocument, content: CertificateContent) {
  const { accentColor, title } = content.design;
  const left = 78;
  const width = WIDTH - left - 60;

  doc.rect(0, 0, 30, HEIGHT).fill(accentColor);
  doc.rect(30, 0, 6, HEIGHT).fillOpacity(0.35).fill(accentColor).fillOpacity(1);

  doc.fillColor(accentColor).font('Helvetica-Bold');
  const titleSize = fitFontSize(doc, title.toUpperCase(), 'Helvetica-Bold', 26, width, 16);
  doc.fontSize(titleSize).text(title.toUpperCase(), left, 72, { width, align: 'left', lineBreak: false, characterSpacing: 1.5 });

  doc.lineWidth(2).strokeColor(accentColor).moveTo(left, 112).lineTo(left + 90, 112).stroke();

  doc.fillColor(GRAY).font('Helvetica').fontSize(14);
  doc.text('Se otorga a', left, 150, { width, align: 'left', lineBreak: false });

  const nameSize = fitFontSize(doc, content.studentName, 'Helvetica-Bold', 40, width, 18);
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(nameSize);
  doc.text(content.studentName, left, 176, { width, align: 'left', lineBreak: false });

  doc.fillColor('#1F2937').font('Helvetica').fontSize(16);
  doc.text(bodyText(content), left, 250, { width: width - 60, align: 'left', lineGap: 5 });

  signatureBlock(doc, content, left, 462, 230);
  footer(doc, content, left, width);
}

/** Dibuja el certificado como un PDF de una página (A4 horizontal) y devuelve sus bytes. */
export function renderCertificatePdf(content: CertificateContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [WIDTH, HEIGHT],
      margin: 0,
      info: {
        Title: `${content.design.title}: ${content.courseTitle}`,
        Author: content.instructorName,
        Subject: `Certificado ${content.code}`,
      },
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      (content.design.layout === 'MODERN' ? modern : classic)(doc, content);

      if (content.preview) {
        watermark(doc, 'VISTA PREVIA', '#6B7280');
      }
      if (content.revoked) {
        watermark(doc, 'REVOCADO', '#DC2626');
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
