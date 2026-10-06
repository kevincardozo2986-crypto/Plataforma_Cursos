/** Documentos que pueden adjuntar los estudiantes en una entrega. */
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

/** Bytes que hay que leer del inicio de un documento para reconocerlo. */
export const DOCUMENT_SIGNATURE_BYTES = 512;

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * Comprueba por los primeros bytes que el archivo sea de verdad lo que dice su extensión,
 * sin fiarse del nombre ni del tipo que declara el navegador.
 * docx, xlsx y pptx son ZIP por dentro; doc, xls y ppt usan el formato OLE antiguo.
 */
export function isValidDocument(head: Buffer, extension: string): boolean {
  switch (extension) {
    case 'pdf':
      return head.toString('latin1', 0, 5) === '%PDF-';
    case 'docx':
    case 'xlsx':
    case 'pptx':
    case 'zip':
      return (
        head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
      );
    case 'doc':
    case 'xls':
    case 'ppt':
      return OLE.every((byte, i) => head[i] === byte);
    case 'txt':
      // Texto plano: sin bytes nulos ni caracteres de control (salvo tab y saltos de línea).
      return (
        head.length > 0 &&
        !head.some((b) => b === 0 || (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d))
      );
    default:
      return false;
  }
}
