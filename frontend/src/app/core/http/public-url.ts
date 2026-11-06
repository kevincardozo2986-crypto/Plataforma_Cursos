/** Solo adapta rutas propias; conserva URLs externas, blobs y anclas. */
export function publicUrl<T>(
  value: T,
  base = typeof document === 'undefined'
    ? '/'
    : (document.querySelector('base')?.getAttribute('href') ?? '/'),
): T {
  if (typeof value !== 'string' || !/^\/(api|images|fonts)(\/|$)/.test(value)) return value;
  return (base.replace(/\/$/, '') + value) as T;
}

/** El editor muestra el prefijo, pero guarda rutas independientes del despliegue. */
export function canonicalMediaHtml(html: string): string {
  const prefix = publicUrl<string>('/api/');
  if (prefix === '/api/') return html;
  return html.replace(/\b(src|href)=(['"])(.*?)\2/gi, (attribute, name, quote, url: string) =>
    url.startsWith(prefix) ? `${name}=${quote}/api/${url.slice(prefix.length)}${quote}` : attribute,
  );
}
