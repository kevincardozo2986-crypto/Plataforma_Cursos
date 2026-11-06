import { DOCUMENT } from '@angular/common';
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { publicUrl } from './public-url';

export const basePathInterceptor: HttpInterceptorFn = (request, next) => {
  const base = inject(DOCUMENT).querySelector('base')?.getAttribute('href') ?? '/';
  return next(request.clone({ url: publicUrl(request.url, base) }));
};
