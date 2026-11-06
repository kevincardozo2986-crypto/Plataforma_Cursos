import { ArgumentsHost, HttpStatus } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaExceptionFilter } from './prisma-exception.filter.js';

function handle(exception: unknown) {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;

  new PrismaExceptionFilter().catch(
    exception as Prisma.PrismaClientValidationError,
    host,
  );

  return {
    status: response.status.mock.calls[0]?.[0],
    body: response.json.mock.calls[0]?.[0],
  };
}

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('fallo de prueba', {
    code,
    clientVersion: 'test',
  });
}

describe('PrismaExceptionFilter', () => {
  it('convierte un error de validación en 400', () => {
    const error = new Prisma.PrismaClientValidationError('id fuera de rango', {
      clientVersion: 'test',
    });

    const result = handle(error);

    expect(result.status).toBe(HttpStatus.BAD_REQUEST);
    expect(result.body).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'La solicitud contiene datos inválidos',
    });
  });

  it.each([
    ['P2000', HttpStatus.BAD_REQUEST],
    ['P2002', HttpStatus.CONFLICT],
    ['P2003', HttpStatus.BAD_REQUEST],
    ['P2023', HttpStatus.BAD_REQUEST],
    ['P2025', HttpStatus.NOT_FOUND],
  ])('mapea %s a %s', (code, status) => {
    expect(handle(knownError(code)).status).toBe(status);
  });

  it('deja los códigos desconocidos como 500 sin filtrar detalles', () => {
    const result = handle(knownError('P9999'));

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body).toEqual({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  });
});
