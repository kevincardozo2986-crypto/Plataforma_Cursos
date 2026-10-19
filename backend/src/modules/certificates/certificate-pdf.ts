import PDFDocument from 'pdfkit';

import type { FontSource } from '../certificate-fonts/certificate-fonts.service.js';
import {
  fillTemplate,
  formatDocument,
  formatHours,
  formatLongDate,
  type Placeholder,
} from './certificate-text.js';

export const CERTIFICATE_LAYOUTS = [
  'CLASSIC',
  'MODERN',
  'ELEGANT',
  'BOLD',
  'MINIMAL',
  'SEAL',
  'GEOMETRIC',
  'SIDEBAR',
  'FRAME',
  'DARK',
  'WAVES',
  'RIBBON',
] as const;

export type CertificateLayout = (typeof CERTIFICATE_LAYOUTS)[number];

/** El diseño de un certificado, tal como se guarda al emitirlo. */
export interface CertificateDesign {
  title: string;
  body: string;
  accentColor: string;
  layout: CertificateLayout;
  /**
   * Tipografía del título y del nombre: "SANS", "SERIF", una de la biblioteca o "custom:<id>".
   * Los certificados emitidos antes de que existiera la opción no la traen: usan SANS.
   */
  font?: string;
  /** Tipografía del texto. Los certificados anteriores tenían una sola para todo: usan `font`. */
  bodyFont?: string;
}

/** Las tipografías ya resueltas con las que se dibuja (ver CertificateFontsService.resolve). */
export interface CertificateFonts {
  heading: FontSource;
  body: FontSource;
}

const HELVETICA: FontSource = { regular: 'Helvetica', bold: 'Helvetica-Bold' };

export interface CertificateContent {
  design: CertificateDesign;
  studentName: string;
  /** Se imprime bajo el nombre; null en los certificados emitidos antes de que existiera. */
  studentDocument?: string | null;
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

const SIGNATURE_Y = 462;

/** Dónde y con qué colores se escribe el texto del certificado en un diseño. */
interface Box {
  x: number;
  width: number;
  align: 'center' | 'left';
  titleY: number;
  titleSize: number;
  /** Título en mayúsculas con letras espaciadas. */
  upper?: boolean;
  contentY: number;
  /** Línea bajo el nombre. */
  rule: 'center' | 'left' | 'none';
  signature: { x: number; width: number };
  /** Fondo claro tras la firma (diseños oscuros, donde la tinta no se vería). */
  signaturePlate?: boolean;
  /** Altura del código de verificación; por defecto, al pie. */
  footerY?: number;
  colors: {
    title: string;
    name: string;
    text: string;
    soft: string;
    accent: string;
    line: string;
    footer: string;
  };
}

const INK = '#111827';
const GRAY = '#4B5563';
const LIGHT = '#9CA3AF';

// ---------- Utilidades de color y dibujo ----------

type Doc = PDFKit.PDFDocument;

/** Mezcla un color con blanco (amount > 0) o con negro (amount < 0). */
export function shade(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  const target = amount >= 0 ? 255 : 0;
  const mixed = channels.map((channel) =>
    Math.round(channel + (target - channel) * Math.abs(amount)),
  );

  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** Achica la letra hasta que el texto quepa en `maxWidth` (con un mínimo, para no ser ilegible). */
function fitFontSize(
  doc: Doc,
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

function star(doc: Doc, cx: number, cy: number, outer: number, inner: number, points = 5) {
  const vertices: [number, number][] = [];

  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI / points) * index - Math.PI / 2;

    vertices.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }

  doc.polygon(...vertices);
}

/** Sello redondo con una estrella; con `tails` le salen dos cintas hacia abajo. */
function seal(doc: Doc, cx: number, cy: number, radius: number, color: string, tails = false) {
  if (tails) {
    doc
      .polygon([cx - radius * 0.55, cy], [cx - radius * 0.1, cy], [cx - radius * 0.35, cy + radius * 1.9], [cx - radius * 0.75, cy + radius * 1.55])
      .fill(shade(color, -0.25));
    doc
      .polygon([cx + radius * 0.55, cy], [cx + radius * 0.1, cy], [cx + radius * 0.35, cy + radius * 1.9], [cx + radius * 0.75, cy + radius * 1.55])
      .fill(shade(color, -0.25));
  }

  doc.circle(cx, cy, radius).fill(color);
  doc.lineWidth(1.5).circle(cx, cy, radius * 0.82).stroke('#FFFFFF');
  star(doc, cx, cy, radius * 0.5, radius * 0.22);
  doc.fill('#FFFFFF');
}

function watermark(doc: Doc, text: string, color: string) {
  doc.save();
  doc.rotate(-30, { origin: [WIDTH / 2, HEIGHT / 2] });
  doc.fillColor(color).fillOpacity(0.13).font('Helvetica-Bold').fontSize(96);
  doc.text(text, 0, HEIGHT / 2 - 48, { width: WIDTH, align: 'center', lineBreak: false });
  doc.restore();
}

// ---------- Los diseños: cada uno dibuja su decoración y devuelve dónde va el texto ----------

const baseColors = (accent: string): Box['colors'] => ({
  title: accent,
  name: INK,
  text: '#1F2937',
  soft: GRAY,
  accent,
  line: '#374151',
  footer: LIGHT,
});

const centered = (x: number, titleY: number, accent: string): Box => ({
  x,
  width: WIDTH - x * 2,
  align: 'center',
  titleY,
  titleSize: 34,
  contentY: 150,
  rule: 'center',
  signature: { x: WIDTH / 2 - 120, width: 240 },
  colors: baseColors(accent),
});

const LAYOUT_DRAWERS: Record<CertificateLayout, (doc: Doc, accent: string) => Box> = {
  CLASSIC(doc, accent) {
    doc.lineWidth(7).strokeColor(accent).rect(22, 22, WIDTH - 44, HEIGHT - 44).stroke();
    doc.lineWidth(1).strokeColor(accent).rect(36, 36, WIDTH - 72, HEIGHT - 72).stroke();

    return centered(70, 84, accent);
  },

  MODERN(doc, accent) {
    doc.rect(0, 0, 30, HEIGHT).fill(accent);
    doc.rect(30, 0, 6, HEIGHT).fillOpacity(0.35).fill(accent).fillOpacity(1);
    doc.lineWidth(2).strokeColor(accent).moveTo(78, 112).lineTo(168, 112).stroke();

    return {
      ...centered(78, 72, accent),
      width: WIDTH - 138,
      align: 'left',
      titleSize: 26,
      upper: true,
      rule: 'none',
      signature: { x: 78, width: 230 },
    };
  },

  ELEGANT(doc, accent) {
    doc.rect(0, 0, WIDTH, HEIGHT).fill('#FFFDF7');
    doc.lineWidth(1.4).strokeColor(accent).rect(26, 26, WIDTH - 52, HEIGHT - 52).stroke();
    doc.lineWidth(0.6).strokeColor(accent).rect(34, 34, WIDTH - 68, HEIGHT - 68).stroke();

    // Remates en las cuatro esquinas.
    for (const [x, y] of [[34, 34], [WIDTH - 34, 34], [34, HEIGHT - 34], [WIDTH - 34, HEIGHT - 34]]) {
      doc.rect(x - 7, y - 7, 14, 14).fill(accent);
      doc.rect(x - 3, y - 3, 6, 6).fill('#FFFDF7');
    }

    // Filete con rombo bajo el título.
    doc.lineWidth(1).strokeColor(accent);
    doc.moveTo(WIDTH / 2 - 130, 132).lineTo(WIDTH / 2 - 12, 132).stroke();
    doc.moveTo(WIDTH / 2 + 12, 132).lineTo(WIDTH / 2 + 130, 132).stroke();
    doc.polygon([WIDTH / 2, 126], [WIDTH / 2 + 6, 132], [WIDTH / 2, 138], [WIDTH / 2 - 6, 132]).fill(accent);

    return { ...centered(80, 78, accent), titleSize: 32, contentY: 158 };
  },

  BOLD(doc, accent) {
    doc.rect(0, 0, WIDTH, 165).fill(accent);
    doc.rect(0, 165, WIDTH, 6).fill(shade(accent, -0.3));
    doc.rect(0, HEIGHT - 14, WIDTH, 14).fill(accent);

    const box = centered(70, 66, accent);

    return { ...box, contentY: 205, colors: { ...box.colors, title: '#FFFFFF' } };
  },

  MINIMAL(doc, accent) {
    doc.rect(70, 58, 64, 5).fill(accent);
    doc.lineWidth(0.6).strokeColor('#D1D5DB').moveTo(70, HEIGHT - 60).lineTo(WIDTH - 70, HEIGHT - 60).stroke();

    return {
      ...centered(70, 90, accent),
      align: 'left',
      titleSize: 30,
      contentY: 165,
      rule: 'none',
      signature: { x: 70, width: 240 },
    };
  },

  SEAL(doc, accent) {
    doc.lineWidth(2.5).strokeColor(accent).rect(24, 24, WIDTH - 48, HEIGHT - 48).stroke();
    doc.lineWidth(0.7).strokeColor(accent).rect(32, 32, WIDTH - 64, HEIGHT - 64).stroke();
    seal(doc, WIDTH - 150, HEIGHT - 175, 46, accent, true);

    return { ...centered(70, 86, accent), signature: { x: 110, width: 240 } };
  },

  GEOMETRIC(doc, accent) {
    doc.polygon([0, 0], [270, 0], [0, 210]).fill(accent);
    doc.polygon([0, 0], [170, 0], [0, 130]).fill(shade(accent, -0.3));
    doc.polygon([WIDTH, HEIGHT], [WIDTH - 270, HEIGHT], [WIDTH, HEIGHT - 210]).fill(accent);
    doc.polygon([WIDTH, HEIGHT], [WIDTH - 170, HEIGHT], [WIDTH, HEIGHT - 130]).fill(shade(accent, -0.3));

    return centered(120, 90, accent);
  },

  SIDEBAR(doc, accent) {
    doc.rect(0, 0, 230, HEIGHT).fill(accent);
    doc.rect(222, 0, 8, HEIGHT).fill(shade(accent, -0.3));
    seal(doc, 115, 230, 56, shade(accent, -0.3), true);
    doc.lineWidth(1).strokeColor(shade(accent, 0.55));
    doc.moveTo(40, 120).lineTo(190, 120).stroke();
    doc.moveTo(40, 470).lineTo(190, 470).stroke();

    return {
      ...centered(270, 84, accent),
      width: WIDTH - 320,
      align: 'left',
      titleSize: 28,
      rule: 'left',
      signature: { x: 270, width: 230 },
    };
  },

  FRAME(doc, accent) {
    doc.rect(0, 0, WIDTH, HEIGHT).fill(shade(accent, 0.92));
    doc.rect(20, 20, WIDTH - 40, HEIGHT - 40).fill('#FFFFFF');
    doc.lineWidth(12).strokeColor(accent).rect(26, 26, WIDTH - 52, HEIGHT - 52).stroke();

    // Esquinas "cortadas".
    for (const [x, y] of [[26, 26], [WIDTH - 26, 26], [26, HEIGHT - 26], [WIDTH - 26, HEIGHT - 26]]) {
      doc.circle(x, y, 16).fill(shade(accent, 0.92));
      doc.lineWidth(2).strokeColor(accent).circle(x, y, 16).stroke();
    }

    return centered(90, 88, accent);
  },

  DARK(doc, accent) {
    const night = shade(accent, -0.78);
    const glow = shade(accent, 0.45);

    doc.rect(0, 0, WIDTH, HEIGHT).fill(night);
    doc.lineWidth(2.5).strokeColor(glow).rect(24, 24, WIDTH - 48, HEIGHT - 48).stroke();
    doc.lineWidth(0.6).strokeColor(shade(accent, 0.2)).rect(34, 34, WIDTH - 68, HEIGHT - 68).stroke();

    return {
      ...centered(80, 86, accent),
      signaturePlate: true,
      colors: {
        title: glow,
        name: '#FFFFFF',
        text: '#E5E7EB',
        soft: '#CBD5E1',
        accent: glow,
        line: '#CBD5E1',
        footer: '#94A3B8',
      },
    };
  },

  WAVES(doc, accent) {
    // Ola superior (dos capas) e inferior.
    doc
      .moveTo(0, 0)
      .lineTo(WIDTH, 0)
      .lineTo(WIDTH, 120)
      .bezierCurveTo(WIDTH * 0.75, 190, WIDTH * 0.35, 60, 0, 130)
      .closePath()
      .fill(shade(accent, 0.45));
    doc
      .moveTo(0, 0)
      .lineTo(WIDTH, 0)
      .lineTo(WIDTH, 96)
      .bezierCurveTo(WIDTH * 0.72, 160, WIDTH * 0.32, 38, 0, 104)
      .closePath()
      .fill(accent);
    doc
      .moveTo(0, HEIGHT)
      .lineTo(WIDTH, HEIGHT)
      .lineTo(WIDTH, HEIGHT - 34)
      .bezierCurveTo(WIDTH * 0.65, HEIGHT - 6, WIDTH * 0.3, HEIGHT - 56, 0, HEIGHT - 28)
      .closePath()
      .fill(accent);

    const box = centered(70, 34, accent);

    return {
      ...box,
      titleSize: 30,
      contentY: 175,
      footerY: HEIGHT - 66,
      colors: { ...box.colors, title: '#FFFFFF' },
    };
  },

  RIBBON(doc, accent) {
    doc.lineWidth(1).strokeColor('#D1D5DB').rect(24, 24, WIDTH - 48, HEIGHT - 48).stroke();

    // Cinta vertical con muesca en V y un sello.
    const x = WIDTH - 150;

    doc.polygon([x, 24], [x + 76, 24], [x + 76, 250], [x + 38, 218], [x, 250]).fill(accent);
    doc.rect(x + 8, 24, 3, 205).fill(shade(accent, 0.4));
    doc.rect(x + 65, 24, 3, 205).fill(shade(accent, 0.4));
    seal(doc, x + 38, 262, 34, shade(accent, -0.3), false);

    return { ...centered(70, 86, accent), width: WIDTH - 70 - 190 };
  },
};

/**
 * Las tipografías del PDF por nombre ("Helvetica") se usan tal cual; un archivo se incrusta
 * registrándolo con un nombre propio de este documento.
 */
function registerFace(doc: Doc, id: string, source: FontSource): { regular: string; bold: string } {
  const name = (variant: 'regular' | 'bold') => {
    const value = source[variant];

    if (typeof value === 'string') {
      return value;
    }

    doc.registerFont(`${id}-${variant}`, value);

    return `${id}-${variant}`;
  };

  // Si negrita y normal son el mismo archivo, se registra una sola vez.
  const regular = name('regular');

  return { regular, bold: source.bold === source.regular ? regular : name('bold') };
}

// ---------- El texto, común a todos los diseños ----------

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

function writeContent(
  doc: Doc,
  content: CertificateContent,
  box: Box,
  fonts: CertificateFonts,
) {
  // Título, nombre y firma van con la tipografía de títulos; el resto, con la del texto.
  const heading = registerFace(doc, 'heading', fonts.heading);
  const body = registerFace(doc, 'body', fonts.body);
  const { colors } = box;
  const title = box.upper ? content.design.title.toUpperCase() : content.design.title;

  // Título
  const titleSize = fitFontSize(doc, title, heading.bold, box.titleSize, box.width, 16);
  doc.fillColor(colors.title).font(heading.bold).fontSize(titleSize);
  doc.text(title, box.x, box.titleY, {
    width: box.width,
    align: box.align,
    lineBreak: false,
    ...(box.upper ? { characterSpacing: 1.5 } : {}),
  });

  // "Se otorga a" y el nombre
  const nameY = box.contentY + 30;

  doc.fillColor(colors.soft).font(body.regular).fontSize(14);
  doc.text('Se otorga a', box.x, box.contentY, { width: box.width, align: box.align, lineBreak: false });

  const nameSize = fitFontSize(doc, content.studentName, heading.bold, 42, box.width, 18);
  doc.fillColor(colors.name).font(heading.bold).fontSize(nameSize);
  doc.text(content.studentName, box.x, nameY, { width: box.width, align: box.align, lineBreak: false });

  // Documento de identidad, en pequeño bajo el nombre
  if (content.studentDocument) {
    doc.fillColor(colors.soft).font(body.regular).fontSize(11);
    doc.text(`Documento de identidad: ${formatDocument(content.studentDocument)}`, box.x, nameY + 50, {
      width: box.width,
      align: box.align,
      lineBreak: false,
    });
  }

  // Línea bajo el nombre
  if (box.rule !== 'none') {
    const ruleY = box.contentY + 100;
    const ruleX = box.rule === 'center' ? WIDTH / 2 - 130 : box.x;

    doc.lineWidth(1.2).strokeColor(colors.accent).moveTo(ruleX, ruleY).lineTo(ruleX + 260, ruleY).stroke();
  }

  // Texto del certificado
  const bodyY = box.contentY + (box.rule === 'none' ? 104 : 124);
  const inset = box.align === 'center' ? 20 : 0;

  doc.fillColor(colors.text).font(body.regular).fontSize(16);
  doc.text(bodyText(content), box.x + inset, bodyY, {
    width: box.width - inset * 2,
    align: box.align,
    lineGap: 5,
  });

  // Firma
  const { x, width } = box.signature;

  if (box.signaturePlate && content.signature) {
    doc.roundedRect(x + width / 2 - 95, SIGNATURE_Y - 78, 190, 74, 8).fill('#F8FAFC');
  }

  if (content.signature) {
    try {
      doc.image(content.signature, x + width / 2 - 85, SIGNATURE_Y - 72, {
        fit: [170, 66],
        align: 'center',
        valign: 'bottom',
      });
    } catch {
      /* Una imagen que pdfkit no entienda no debe impedir emitir el certificado. */
    }
  }

  doc.lineWidth(0.8).strokeColor(colors.line).moveTo(x, SIGNATURE_Y).lineTo(x + width, SIGNATURE_Y).stroke();
  doc.fillColor(colors.name).font(heading.bold).fontSize(12);
  doc.text(content.instructorName, x, SIGNATURE_Y + 6, { width, align: 'center', lineBreak: false });
  doc.fillColor(colors.soft).font(body.regular).fontSize(9.5);
  doc.text('Docente', x, SIGNATURE_Y + 22, { width, align: 'center', lineBreak: false });

  // Código de verificación
  doc.fillColor(colors.footer).font('Helvetica').fontSize(8.5);
  doc.text(
    `Código de verificación: ${content.code}   ·   ${content.verifyUrl}`,
    box.x,
    box.footerY ?? HEIGHT - 44,
    { width: box.width, align: 'center', lineBreak: false },
  );
}

/** Dibuja el certificado como un PDF de una página (A4 horizontal) y devuelve sus bytes. */
export function renderCertificatePdf(
  content: CertificateContent,
  fonts: CertificateFonts = { heading: HELVETICA, body: HELVETICA },
): Promise<Buffer> {
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
      const draw = LAYOUT_DRAWERS[content.design.layout] ?? LAYOUT_DRAWERS.CLASSIC;
      const box = draw(doc, content.design.accentColor);

      writeContent(doc, content, box, fonts);

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
