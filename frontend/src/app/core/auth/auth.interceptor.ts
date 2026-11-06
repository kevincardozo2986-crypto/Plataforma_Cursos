import { HttpInterceptorFn } from '@angular/common/http';
import { publicUrl } from '../http/public-url';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Nunca enviar el token de la universidad a una URL externa.
  if (!req.url.startsWith('/api/') && !req.url.startsWith(publicUrl<string>('/api/')))
    return next(req);
  let token: string | null = null;

  try {
    token =
      localStorage.getItem('campus.accessToken') ?? sessionStorage.getItem('campus.accessToken');
  } catch {
    token = null;
  }

  if (!token) {
    return next(req);
  }

  const authenticatedRequest = req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });

  return next(authenticatedRequest);
};
