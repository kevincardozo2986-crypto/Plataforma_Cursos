export type CertificateLayout =
  | 'CLASSIC'
  | 'MODERN'
  | 'ELEGANT'
  | 'BOLD'
  | 'MINIMAL'
  | 'SEAL'
  | 'GEOMETRIC'
  | 'SIDEBAR'
  | 'FRAME'
  | 'DARK'
  | 'WAVES'
  | 'RIBBON'
  | 'IMAGE';
export type CertificateStatus = 'VALID' | 'REVOKED';

export const LAYOUT_LABELS: Record<CertificateLayout, { label: string; hint: string }> = {
  CLASSIC: { label: 'Clásico', hint: 'Doble borde, todo centrado.' },
  MODERN: { label: 'Moderno', hint: 'Barra de color a la izquierda.' },
  ELEGANT: { label: 'Elegante', hint: 'Papel crema, filete y remates en las esquinas.' },
  BOLD: { label: 'Cabecera', hint: 'Banda de color con el título en blanco.' },
  MINIMAL: { label: 'Minimalista', hint: 'Mucho aire, solo una línea de color.' },
  SEAL: { label: 'Con sello', hint: 'Borde fino y un sello con cinta.' },
  GEOMETRIC: { label: 'Geométrico', hint: 'Triángulos de color en dos esquinas.' },
  SIDEBAR: { label: 'Panel lateral', hint: 'Panel de color con sello a la izquierda.' },
  FRAME: { label: 'Marco', hint: 'Marco grueso con esquinas redondeadas.' },
  DARK: { label: 'Oscuro', hint: 'Fondo oscuro con texto claro.' },
  WAVES: { label: 'Olas', hint: 'Olas de color arriba y abajo.' },
  RIBBON: { label: 'Cinta', hint: 'Cinta vertical con un sello.' },
  IMAGE: {
    label: 'Mi imagen',
    hint: 'Sube tu propia imagen de fondo y el texto se escribe encima.',
  },
};

export const LAYOUTS = Object.keys(LAYOUT_LABELS) as CertificateLayout[];

/** Las del PDF, sin incrustar nada. */
export const DEFAULT_FONT = 'SANS';

export type FontCategory = 'Sans' | 'Serif' | 'Cursiva' | 'Título' | 'Mía';

/** Una tipografía que se puede elegir (de GET /certificate-fonts). */
export interface FontOption {
  /** "SANS", "SERIF", "playfair-display" o "custom:12". Es lo que guarda la plantilla. */
  key: string;
  label: string;
  category: FontCategory;
  /** false = no tiene negrita: los títulos usan la normal. */
  hasBold: boolean;
  /** Archivo para mostrarla en pantalla; las del PDF (Helvetica y Times) no lo necesitan. */
  regularUrl?: string;
  boldUrl?: string | null;
  /** Solo en las propias. */
  id?: number;
}

export interface FontCatalog {
  standard: FontOption[];
  library: FontOption[];
  custom: FontOption[];
}

/** Marcadores que se pueden escribir en el texto: se reemplazan al emitir el certificado. */
export const PLACEHOLDERS: { token: string; label: string }[] = [
  { token: '{{student}}', label: 'Estudiante' },
  { token: '{{course}}', label: 'Curso' },
  { token: '{{date}}', label: 'Fecha' },
  { token: '{{hours}}', label: 'Duración' },
  { token: '{{instructor}}', label: 'Docente' },
];

export const DEFAULT_TITLE = 'Certificado de finalización';
export const DEFAULT_BODY =
  'Por haber completado satisfactoriamente el curso «{{course}}», impartido por {{instructor}}, el {{date}}.';
export const DEFAULT_COLOR = '#1F3A8A';

/** El estilo de un texto (título, nombre o texto). Lo que falta toma el valor del diseño. */
export interface TextStyle {
  /** true = negrita, false = sin ella, ausente = automática. */
  bold?: boolean;
  italic?: boolean;
  /** Porcentaje del tamaño normal (60–140). */
  size?: number;
  /** #RRGGBB; ausente = el color del diseño. */
  color?: string;
}

/** Los bloques de texto que se pueden mover. «recipient» es «Se otorga a», el nombre, la cédula y la línea. */
export type OffsetPart = 'title' | 'recipient' | 'body' | 'signature';

/** Cuánto se corrió un bloque desde su sitio, en puntos de página (A4 horizontal: 842 × 595). */
export interface Offset {
  x: number;
  y: number;
}

export type Offsets = Partial<Record<OffsetPart, Offset>>;

export interface CertificateStyle {
  title?: TextStyle;
  name?: TextStyle;
  body?: TextStyle;
  /** false = no mostrar la cédula bajo el nombre. */
  showDocument?: boolean;
  /** Velo blanco detrás del texto, en porcentaje (0–80): ayuda a leerlo sobre una imagen. */
  veil?: number;
  /** Dónde está cada bloque de texto respecto a su sitio original. */
  offsets?: Offsets;
}

export interface CertificateTemplate {
  id: number;
  name: string;
  title: string;
  body: string;
  accentColor: string;
  layout: CertificateLayout;
  /** Tipografía de título y nombre. */
  font: string;
  /** Tipografía del texto. */
  bodyFont: string;
  style: CertificateStyle;
  /** Imagen de fondo propia (solo con el diseño IMAGE). */
  backgroundUrl: string | null;
  ownerId: number;
  createdAt: string;
  updatedAt: string;
  /** Solo en la lista. */
  _count?: { courses: number };
  owner?: { id: number; firstName: string; lastName: string };
}

export interface CertificateTemplateInput {
  name: string;
  title: string;
  body: string;
  accentColor: string;
  layout: CertificateLayout;
  font: string;
  bodyFont: string;
  style: CertificateStyle;
  backgroundUrl: string | null;
}

export interface IssuedCertificate {
  id: number;
  code: string;
  status: CertificateStatus;
  studentName: string;
  studentDocument: string | null;
  courseId: number;
  courseTitle: string;
  issuedAt: string;
  revokedAt: string | null;
  user: { id: number; email: string };
}

export interface IssuedPage {
  items: IssuedCertificate[];
  total: number;
}

export interface MyCertificate {
  id: number;
  code: string;
  status: CertificateStatus;
  courseId: number;
  courseTitle: string;
  instructorName: string;
  issuedAt: string;
}

/** Respuesta pública de GET /certificates/verify/:code. */
export interface Verification {
  valid: boolean;
  status: CertificateStatus;
  revokedAt: string | null;
  code: string;
  studentName: string;
  courseTitle: string;
  courseMinutes: number | null;
  instructorName: string;
  issuedAt: string;
}
