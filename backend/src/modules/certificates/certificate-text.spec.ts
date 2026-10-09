import {
  CODE_PATTERN,
  DEFAULT_BODY,
  fillTemplate,
  findUnknownPlaceholders,
  formatHours,
  formatLongDate,
  generateCode,
  normalizeCode,
  pdfFileName,
} from './certificate-text.js';

const values = { student: 'Ana Ruiz', course: 'Angular', date: '9 de octubre de 2026', hours: '20 horas', instructor: 'Laura Gómez' };

describe('findUnknownPlaceholders', () => {
  it('no marca los marcadores válidos, con o sin espacios', () => {
    expect(findUnknownPlaceholders('{{student}} {{ course }} {{date}} {{hours}} {{instructor}}')).toEqual([]);
  });

  it('lista los que no existen, sin repetir', () => {
    expect(findUnknownPlaceholders('{{estudiante}} {{course}} {{estudiante}} {{nota}}')).toEqual(['estudiante', 'nota']);
  });

  it('el texto por defecto es válido', () => {
    expect(findUnknownPlaceholders(DEFAULT_BODY)).toEqual([]);
  });
});

describe('fillTemplate', () => {
  it('reemplaza los marcadores', () => {
    expect(fillTemplate('{{student}} terminó {{course}} ({{hours}})', values)).toBe('Ana Ruiz terminó Angular (20 horas)');
  });

  it('acepta espacios dentro de las llaves y repetidos', () => {
    expect(fillTemplate('{{ course }} y {{course}}', values)).toBe('Angular y Angular');
  });

  it('un marcador desconocido se deja como está', () => {
    expect(fillTemplate('Hola {{otro}}', values)).toBe('Hola {{otro}}');
  });

  it('el texto por defecto queda legible', () => {
    expect(fillTemplate(DEFAULT_BODY, values)).toBe(
      'Por haber completado satisfactoriamente el curso «Angular», impartido por Laura Gómez, el 9 de octubre de 2026.',
    );
  });

  it('no interpreta los valores como marcadores (un nombre con llaves no se rompe)', () => {
    expect(fillTemplate('{{student}}', { ...values, student: '{{course}}' })).toBe('{{course}}');
  });
});

describe('formatHours', () => {
  it('sin duración queda vacío', () => {
    expect(formatHours(null)).toBe('');
    expect(formatHours(0)).toBe('');
  });

  it('menos de una hora, en minutos', () => {
    expect(formatHours(1)).toBe('1 minuto');
    expect(formatHours(45)).toBe('45 minutos');
  });

  it('desde una hora, en horas con coma decimal', () => {
    expect(formatHours(60)).toBe('1 hora');
    expect(formatHours(90)).toBe('1,5 horas');
    expect(formatHours(1200)).toBe('20 horas');
  });
});

describe('formatLongDate', () => {
  it('en español y en la zona horaria indicada', () => {
    expect(formatLongDate(new Date('2026-10-09T15:00:00.000Z'))).toBe('9 de octubre de 2026');
  });

  it('a medianoche UTC todavía es el día anterior en Colombia', () => {
    expect(formatLongDate(new Date('2026-10-10T02:00:00.000Z'))).toBe('9 de octubre de 2026');
    expect(formatLongDate(new Date('2026-10-10T02:00:00.000Z'), 'UTC')).toBe('10 de octubre de 2026');
  });
});

describe('códigos de verificación', () => {
  it('tienen la forma CC-XXXX-XXXX-XXXX', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(CODE_PATTERN);
    }
  });

  it('no usan letras confusas (0, O, 1, I, L)', () => {
    const joined = Array.from({ length: 300 }, generateCode).join('').replace(/CC-/g, '').replace(/-/g, '');

    expect(joined).not.toMatch(/[01ILO]/);
  });

  it('no se repiten (en una muestra grande)', () => {
    expect(new Set(Array.from({ length: 5000 }, generateCode)).size).toBe(5000);
  });

  it('normalizeCode acepta minúsculas y espacios, y rechaza lo que no tiene la forma', () => {
    expect(normalizeCode('  cc-7f3k-9qxa-b2md ')).toBe('CC-7F3K-9QXA-B2MD');
    expect(normalizeCode('CC-0000-0000-0000')).toBeNull(); // el 0 no existe en el alfabeto
    expect(normalizeCode('hola')).toBeNull();
    expect(normalizeCode("CC-7F3K-9QXA-B2MD'; DROP TABLE")).toBeNull();
  });
});

describe('pdfFileName', () => {
  it('queda en ASCII, sin tildes ni espacios', () => {
    expect(pdfFileName('Introducción a Angular: ¡Básico!')).toBe('certificado-introduccion-a-angular-basico.pdf');
  });

  it('un título sin letras usa un nombre genérico', () => {
    expect(pdfFileName('???')).toBe('certificado-curso.pdf');
  });
});
