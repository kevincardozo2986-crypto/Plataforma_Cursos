import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
@Injectable()
export class RecoveryRateGuard implements CanActivate {
  private readonly windows = new Map<
    string,
    { until: number; count: number }
  >();
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const key = `${request.ip ?? request.socket.remoteAddress}:${request.path}`;
    for (const [ip, item] of this.windows)
      if (item.until <= now) this.windows.delete(ip);
    let window = this.windows.get(key);
    if (!window) {
      if (this.windows.size >= 10000)
        throw new HttpException('Intenta de nuevo mas tarde.', 429);
      window = { until: now + 15 * 60000, count: 0 };
      this.windows.set(key, window);
    }
    if (++window.count > 15)
      throw new HttpException(
        'Demasiados intentos. Intenta de nuevo en 15 minutos.',
        429,
      );
    return true;
  }
}
