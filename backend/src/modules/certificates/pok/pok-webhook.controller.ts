import { Controller, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { verifyWebhook } from './pok-api.js';
import { PokService } from './pok.service.js';

/**
 * Avisos de POK (`credential-emitted`, `credential-accepted`…). Es público (POK no tiene sesión): se
 * autentica con la firma HMAC (`POK_WEBHOOK_SIGNING_KEY`) o con el secreto compartido (`POK_WEBHOOK_SECRET`).
 * Responde 200 aunque el aviso no sea nuestro, para que POK no lo reenvíe.
 */
@Controller('pok')
export class PokWebhookController {
  constructor(private readonly pok: PokService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    const check = verifyWebhook({
      rawBody,
      headers: req.headers,
      signingKey: process.env.POK_WEBHOOK_SIGNING_KEY?.trim() || undefined,
      sharedSecret: process.env.POK_WEBHOOK_SECRET?.trim() || undefined,
    });

    if (!check.ok) {
      throw new UnauthorizedException(check.reason ?? 'Aviso no autorizado');
    }

    return this.pok.handleEvent(req.body as unknown);
  }
}
