import { DOCUMENT } from '@angular/common';
import { inject, Pipe, PipeTransform } from '@angular/core';
import { publicUrl } from './public-url';

@Pipe({ name: 'publicUrl' })
export class PublicUrlPipe implements PipeTransform {
  private readonly document = inject(DOCUMENT);
  transform<T>(value: T): T {
    return publicUrl(value, this.document.querySelector('base')?.getAttribute('href') ?? '/');
  }
}
