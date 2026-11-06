/** Falla al arrancar si la configuración de producción deja secretos o HTTP de ejemplo. */
export function validateSecurityConfig(
  env: Record<string, unknown>,
): Record<string, unknown> {
  if (env.NODE_ENV !== 'production') return env;
  const secret = typeof env.JWT_SECRET === 'string' ? env.JWT_SECRET : '';
  if (
    Buffer.byteLength(secret, 'utf8') < 32 ||
    /change.?me|test.secret|example|123456/i.test(secret)
  ) {
    throw new Error(
      'Producción requiere JWT_SECRET aleatorio de al menos 32 bytes, sin valores de ejemplo.',
    );
  }
  const appUrl = typeof env.APP_URL === 'string' ? env.APP_URL : '';
  let publicUrl: URL;
  try {
    publicUrl = new URL(appUrl);
  } catch {
    throw new Error('Producción requiere APP_URL HTTPS.');
  }
  if (
    publicUrl.protocol !== 'https:' ||
    publicUrl.username ||
    publicUrl.password
  ) {
    throw new Error('Producción requiere APP_URL HTTPS sin credenciales.');
  }
  const origins =
    typeof env.CORS_ORIGINS === 'string'
      ? env.CORS_ORIGINS.split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
  if (!origins.length)
    throw new Error('Producción requiere CORS_ORIGINS explícito.');
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (url.protocol !== 'https:' || url.origin !== origin) throw new Error();
    } catch {
      throw new Error(
        'CORS_ORIGINS debe contener orígenes HTTPS sin rutas ni comodines.',
      );
    }
  }
  if (!origins.includes(publicUrl.origin))
    throw new Error('CORS_ORIGINS debe incluir el origen de APP_URL.');
  return env;
}
