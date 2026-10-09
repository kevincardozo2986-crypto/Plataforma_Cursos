import { isoToLocalInput, localInputToIso } from './due-date';

describe('due date', () => {
  it('sin fecha, el campo queda vacío y no se envía nada', () => {
    expect(isoToLocalInput(null)).toBe('');
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('   ')).toBeNull();
  });

  it('una fecha inválida se ignora', () => {
    expect(isoToLocalInput('no es una fecha')).toBe('');
    expect(localInputToIso('no es una fecha')).toBeNull();
  });

  it('ida y vuelta: lo que se muestra es la hora local y vuelve al mismo instante', () => {
    const iso = '2026-11-30T23:59:00.000Z';
    const shown = isoToLocalInput(iso);

    expect(shown).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(localInputToIso(shown)).toBe(iso);
  });

  it('manda una fecha ISO válida con zona', () => {
    expect(localInputToIso('2026-11-30T23:59')).toMatch(/^2026-1[12]-\d{2}T\d{2}:\d{2}:00\.000Z$/);
  });
});
