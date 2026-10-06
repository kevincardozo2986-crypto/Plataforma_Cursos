import {
  isURL,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/** Archivos subidos a este servidor: /api/uploads/<32 hex>.<extensión>. */
export const UPLOAD_URL_PATTERN =
  /^\/api\/uploads\/[a-f0-9]{32}\.(?:png|jpe?g|gif|webp|mp4|mov|webm|ogv|ogg)$/;

/** ¿Es una URL externa (http/https) o un archivo ya subido a la plataforma? */
export function isMediaUrl(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  return (
    UPLOAD_URL_PATTERN.test(value) ||
    isURL(value, { protocols: ['http', 'https'], require_protocol: true })
  );
}

/**
 * Acepta una URL http(s) o la ruta de un archivo subido con POST /uploads.
 * Un `@IsUrl()` normal rechazaría las rutas relativas de los archivos subidos.
 */
export function IsMediaUrl(message: string, options?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'isMediaUrl',
      target: target.constructor,
      propertyName,
      options: { message, ...options },
      validator: {
        validate: (value: unknown, _args: ValidationArguments) => isMediaUrl(value),
      },
    });
  };
}
