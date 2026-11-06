import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

import { Prisma } from '../../generated/prisma/client.js';

/**
 * Códigos de Prisma que en realidad son un error de la petición y no del servidor.
 * P2000: valor demasiado largo; P2002: restricción única; P2003: llave foránea;
 * P2023: dato inconsistente o fuera de rango; P2025: registro no encontrado.
 */
const REQUEST_ERROR_STATUS: Record<string, number> = {
  P2000: HttpStatus.BAD_REQUEST,
  P2002: HttpStatus.CONFLICT,
  P2003: HttpStatus.BAD_REQUEST,
  P2023: HttpStatus.BAD_REQUEST,
  P2025: HttpStatus.NOT_FOUND,
};

/**
 * Convierte los errores de validación de Prisma (por ejemplo, un id que no cabe
 * en un entero de 32 bits) en respuestas 4xx en vez de 500.
 */
@Catch(
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientKnownRequestError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      | Prisma.PrismaClientValidationError
      | Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ) {
    const response = host.switchToHttp().getResponse<Response>();

    const status =
      exception instanceof Prisma.PrismaClientKnownRequestError
        ? (REQUEST_ERROR_STATUS[exception.code] ??
          HttpStatus.INTERNAL_SERVER_ERROR)
        : HttpStatus.BAD_REQUEST;

    const message =
      status === HttpStatus.INTERNAL_SERVER_ERROR
        ? 'Internal server error'
        : 'La solicitud contiene datos inválidos';

    response.status(status).json({ statusCode: status, message });
  }
}
