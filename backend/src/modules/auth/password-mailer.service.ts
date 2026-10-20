import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

@Injectable()
export class PasswordMailer {
  constructor(private readonly config: ConfigService) {}
  private settings() {
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');
    if (!user || !pass)
      throw new ServiceUnavailableException(
        'El envio de correo aun no esta configurado. Contacta al administrador.',
      );
    return { user, pass };
  }
  assertConfigured(): void {
    this.settings();
  }
  async sendCode(email: string, code: string): Promise<void> {
    const { user, pass } = this.settings();
    const port = Number(this.config.get<string>('SMTP_PORT') ?? '465');
    const transport = createTransport({
      host: this.config.get<string>('SMTP_HOST') ?? 'smtp.gmail.com',
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user, pass },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    try {
      const result = await transport.sendMail({
        from: { name: 'Campus Virtual', address: user },
        to: email,
        subject: 'Tu codigo para cambiar la contrasena - Campus Virtual',
        text: `Tu codigo de verificacion es: ${code}\n\nVence en 10 minutos y solo se puede usar una vez. No compartas este codigo. Si no solicitaste el cambio, ignora este correo.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#10264c;padding:32px"><h2>Protege tu cuenta</h2><p>Usa este codigo para cambiar tu contrasena en Campus Virtual.</p><p style="font-size:36px;letter-spacing:8px;font-weight:bold;background:#edf5ff;padding:24px;text-align:center;border-radius:16px">${code}</p><p>Vence en <strong>10 minutos</strong> y solo se puede usar una vez.</p><p>No compartas este codigo. Si no solicitaste el cambio, ignora este correo.</p></div>`,
      });
      if (result.rejected.length) throw new Error('Recipient rejected');
    } catch {
      throw new ServiceUnavailableException(
        'No pudimos enviar el codigo. Intenta de nuevo mas tarde.',
      );
    } finally {
      transport.close();
    }
  }
}
