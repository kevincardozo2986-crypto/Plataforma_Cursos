/**
 * Vista previa en el navegador de documentos de Office (.docx, .xlsx, .pptx) y listado de un .zip.
 * Es una lectura simplificada (texto, tablas, listas): no replica el diseño exacto del documento.
 * Las librerías se cargan solo cuando se abre una vista previa.
 */

export const OFFICE_EXTENSIONS = ['docx', 'xlsx', 'pptx', 'zip'];

const MAX_ROWS = 200;
const MAX_COLS = 30;
const MAX_SHEETS = 3;

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const parse = (xml: string): Document => new DOMParser().parseFromString(xml, 'application/xml');

/** Convierte el HTML o la lectura del archivo en HTML seguro para mostrar. */
export async function officePreviewHtml(blob: Blob, extension: string): Promise<string> {
  const buffer = await blob.arrayBuffer();

  if (extension === 'docx') {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.convertToHtml({ arrayBuffer: buffer });

    return value || '<p>El documento no tiene texto para mostrar.</p>';
  }

  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);

  if (extension === 'zip') return zipList(zip);
  if (extension === 'xlsx') return await sheets(zip);
  if (extension === 'pptx') return await slides(zip);

  throw new Error('Formato sin vista previa');
}

function zipList(zip: import('jszip')): string {
  const names = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);

  if (names.length === 0) return '<p>El ZIP está vacío.</p>';

  return `<p><strong>Contenido del ZIP (${names.length} archivos):</strong></p><ul>${names
    .slice(0, 300)
    .map((name) => `<li>${escapeHtml(name)}</li>`)
    .join('')}</ul>`;
}

async function sheets(zip: import('jszip')): Promise<string> {
  const shared: string[] = [];
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');

  if (sharedXml) {
    parse(sharedXml)
      .querySelectorAll('si')
      .forEach((si) => shared.push(Array.from(si.querySelectorAll('t')).map((t) => t.textContent ?? '').join('')));
  }

  const names: string[] = [];
  const workbook = await zip.file('xl/workbook.xml')?.async('string');

  if (workbook) {
    parse(workbook)
      .querySelectorAll('sheet')
      .forEach((sheet) => names.push(sheet.getAttribute('name') ?? ''));
  }

  const files = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10))
    .slice(0, MAX_SHEETS);

  let html = '';

  for (const [index, file] of files.entries()) {
    const doc = parse((await zip.file(file)?.async('string')) ?? '');
    const rows: string[] = [];

    doc.querySelectorAll('sheetData > row').forEach((row, rowIndex) => {
      if (rowIndex >= MAX_ROWS) return;

      const cells: string[] = [];

      row.querySelectorAll('c').forEach((cell) => {
        const ref = cell.getAttribute('r') ?? '';
        const column = ref.replace(/\d/g, '').split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

        if (column >= MAX_COLS) return;

        const raw = cell.querySelector('v')?.textContent ?? cell.querySelector('is')?.textContent ?? '';
        const value = cell.getAttribute('t') === 's' ? (shared[Number(raw)] ?? '') : raw;

        while (cells.length < column) cells.push('<td></td>');
        cells.push(`<td>${escapeHtml(value)}</td>`);
      });

      rows.push(`<tr>${cells.join('')}</tr>`);
    });

    html += `<h4>${escapeHtml(names[index] || `Hoja ${index + 1}`)}</h4><div class="table-wrap"><table>${rows.join('')}</table></div>`;
  }

  return html || '<p>La hoja de cálculo no tiene datos para mostrar.</p>';
}

async function slides(zip: import('jszip')): Promise<string> {
  const files = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));

  let html = '';

  for (const [index, file] of files.entries()) {
    const doc = parse((await zip.file(file)?.async('string')) ?? '');
    const paragraphs = Array.from(doc.querySelectorAll('p'))
      .map((p) => Array.from(p.querySelectorAll('t')).map((t) => t.textContent ?? '').join(''))
      .filter((text) => text.trim());

    html += `<h4>Diapositiva ${index + 1}</h4>${
      paragraphs.length ? paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join('') : '<p><em>(sin texto)</em></p>'
    }`;
  }

  return html || '<p>La presentación no tiene texto para mostrar.</p>';
}
