import { fillSample, HEX_COLOR, sampleValues, unknownPlaceholders } from './certificate-text';

describe('unknownPlaceholders', () => {
  it('no marca los válidos, con o sin espacios', () => {
    expect(
      unknownPlaceholders('{{student}} {{ course }} {{date}} {{hours}} {{instructor}}'),
    ).toEqual([]);
  });

  it('lista los desconocidos sin repetir', () => {
    expect(unknownPlaceholders('{{estudiante}} {{course}} {{estudiante}} {{nota}}')).toEqual([
      'estudiante',
      'nota',
    ]);
  });
});

describe('fillSample', () => {
  const values = { student: 'Ana', course: 'Angular' };

  it('reemplaza los marcadores conocidos', () => {
    expect(fillSample('{{student}} terminó {{ course }}', values)).toBe('Ana terminó Angular');
  });

  it('deja los desconocidos como están', () => {
    expect(fillSample('Hola {{otro}}', values)).toBe('Hola {{otro}}');
  });

  it('trae datos de ejemplo para todos los marcadores', () => {
    expect(Object.keys(sampleValues('Laura'))).toEqual([
      'student',
      'course',
      'date',
      'hours',
      'instructor',
    ]);
  });
});

describe('HEX_COLOR', () => {
  it.each(['#1F3A8A', '#abcdef'])('acepta %s', (value) => expect(HEX_COLOR.test(value)).toBe(true));
  it.each(['1F3A8A', '#123', 'azul', '#GGGGGG'])('rechaza %s', (value) =>
    expect(HEX_COLOR.test(value)).toBe(false),
  );
});
