import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../database/prisma.service.js';
import { Role, UserStatus } from '../../generated/prisma/enums.js';

const DEFAULT_EMAIL = 'admin@campus.com';
const DEFAULT_PASSWORD = 'Admin2026*';
const DEFAULT_DOCUMENT = 'ADMIN-0001';

/**
 * Crea el administrador inicial al arrancar la API, solo si su correo todavía no
 * existe (nunca modifica una cuenta ya creada). La contraseña se guarda con
 * bcrypt, igual que la de cualquier usuario registrado.
 *
 * Se puede desactivar con `ADMIN_BOOTSTRAP=false` y cambiar los datos con
 * `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME` y
 * `ADMIN_DOCUMENT`. En producción no se crea si falta `ADMIN_PASSWORD`, para no
 * dejar una contraseña conocida en un servidor público.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<string>('ADMIN_BOOTSTRAP') === 'false') return;

    const email = (
      this.config.get<string>('ADMIN_EMAIL') ?? DEFAULT_EMAIL
    )
      .trim()
      .toLowerCase();
    const configuredPassword = this.config.get<string>('ADMIN_PASSWORD');

    if (
      this.config.get<string>('NODE_ENV') === 'production' &&
      !configuredPassword
    ) {
      this.logger.warn(
        'Administrador por defecto omitido: en producción hace falta ADMIN_PASSWORD.',
      );
      return;
    }

    const password = configuredPassword ?? DEFAULT_PASSWORD;
    const document = (
      this.config.get<string>('ADMIN_DOCUMENT') ?? DEFAULT_DOCUMENT
    ).trim();

    try {
      const existing = await this.prisma.user.findUnique({ where: { email } });

      if (existing) {
        this.logger.log(`Administrador ya existe: ${email}`);
        return;
      }

      const documentOwner = await this.prisma.user.findUnique({
        where: { document },
      });

      if (documentOwner) {
        this.logger.warn(
          `No se creó el administrador: el documento ${document} ya pertenece a otra cuenta.`,
        );
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);

      await this.prisma.user.create({
        data: {
          firstName: this.config.get<string>('ADMIN_FIRST_NAME') ?? 'Administrador',
          lastName: this.config.get<string>('ADMIN_LAST_NAME') ?? 'Campus',
          email,
          passwordHash,
          document,
          role: Role.ADMIN,
          status: UserStatus.ACTIVE,
        },
      });

      this.logger.log(`Administrador creado: ${email}`);
    } catch (error) {
      this.logger.error(
        `No se pudo crear el administrador ${email}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
