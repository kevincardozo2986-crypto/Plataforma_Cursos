import { formatDuration } from './format-duration';

describe('formatDuration', () => {
  it.each([
    [null, ''],
    [0, ''],
    [1, '1 minuto'],
    [45, '45 minutos'],
    [60, '1 hora'],
    [90, '1,5 horas'],
    [1200, '20 horas'],
  ])('%s -> %s', (input, expected) => expect(formatDuration(input)).toBe(expected));
});
