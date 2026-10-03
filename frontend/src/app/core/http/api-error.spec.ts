import { HttpErrorResponse } from '@angular/common/http';

import { apiErrorMessage } from './api-error';

const http = (status: number, body: unknown) =>
  new HttpErrorResponse({ status, error: body });

describe('apiErrorMessage', () => {
  it('usa el mensaje del backend', () => {
    expect(apiErrorMessage(http(409, { message: 'Ya existe' }), 'x')).toBe('Ya existe');
  });

  it('une los mensajes de validación', () => {
    expect(apiErrorMessage(http(400, { message: ['a', 'b'] }), 'x')).toBe('a · b');
  });

  it('avisa si no hay conexión', () => {
    expect(apiErrorMessage(http(0, null), 'x')).toContain('No pudimos conectar');
  });

  it('usa el texto de respaldo si no hay mensaje', () => {
    expect(apiErrorMessage(http(500, {}), 'Falló')).toBe('Falló');
    expect(apiErrorMessage(new Error('boom'), 'Falló')).toBe('Falló');
  });
});
