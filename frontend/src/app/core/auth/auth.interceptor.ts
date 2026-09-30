import {
  HttpInterceptorFn,
} from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (
  req,
  next,
) => {
  let token: string | null = null;

  try {
    token =
      localStorage.getItem('campus.accessToken') ??
      sessionStorage.getItem('campus.accessToken');
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