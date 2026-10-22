import { extensionOf, formatSize } from './upload-rules';

/** Los mismos que acepta el servidor (POST /uploads/documents). */
export const DOCUMENT_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'zip',
  'txt',
];

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/** Valor para el atributo `accept` del selector de archivos. */
export const ACCEPT_DOCUMENTS = DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`).join(',');

export const DOCUMENT_FORMATS = 'PDF, Word, Excel, PowerPoint, ZIP o TXT';

/** Un archivo ya subido (privado) y listo para adjuntarse a una tarea o a una entrega. */
export interface DocumentFile {
  /** Nombre con el que quedó guardado (el que se envía al servidor). */
  name: string;
  /** Nombre que tenía en el computador de quien lo subió. */
  originalName: string;
  size: number;
}

export type DocumentKind = 'pdf' | 'word' | 'excel' | 'powerpoint' | 'zip' | 'text' | 'other';

/** Qué tipo de documento es, para mostrar su etiqueta y su color. */
export function documentKind(fileName: string): DocumentKind {
  switch (extensionOf(fileName)) {
    case 'pdf':
      return 'pdf';
    case 'doc':
    case 'docx':
      return 'word';
    case 'xls':
    case 'xlsx':
      return 'excel';
    case 'ppt':
    case 'pptx':
      return 'powerpoint';
    case 'zip':
      return 'zip';
    case 'txt':
      return 'text';
    default:
      return 'other';
  }
}

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  pdf: 'PDF',
  word: 'Word',
  excel: 'Excel',
  powerpoint: 'PowerPoint',
  zip: 'ZIP',
  text: 'TXT',
  other: 'Archivo',
};

/** Mensaje de error si el archivo no sirve; null si se puede subir. */
export function validateDocument(file: { name: string; size: number }): string | null {
  if (!DOCUMENT_EXTENSIONS.includes(extensionOf(file.name))) {
    return `El archivo debe ser ${DOCUMENT_FORMATS}.`;
  }

  if (file.size <= 0) {
    return 'El archivo está vacío.';
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    return `El archivo pesa ${formatSize(file.size)} y el máximo es ${formatSize(MAX_DOCUMENT_BYTES)}.`;
  }

  return null;
}
