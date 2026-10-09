export type CertificateLayout = 'CLASSIC' | 'MODERN';
export type CertificateStatus = 'VALID' | 'REVOKED';

export const LAYOUT_LABELS: Record<CertificateLayout, { label: string; hint: string }> = {
  CLASSIC: { label: 'Clásico', hint: 'Doble borde y todo centrado.' },
  MODERN: { label: 'Moderno', hint: 'Barra de color a la izquierda y texto alineado.' },
};

export const LAYOUTS = Object.keys(LAYOUT_LABELS) as CertificateLayout[];

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

export interface CertificateTemplate {
  id: number;
  name: string;
  title: string;
  body: string;
  accentColor: string;
  layout: CertificateLayout;
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
}

export interface IssuedCertificate {
  id: number;
  code: string;
  status: CertificateStatus;
  studentName: string;
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
