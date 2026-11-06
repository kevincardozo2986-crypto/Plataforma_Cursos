import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import type { PrismaService } from '../../database/prisma.service.js';
import { AdminBootstrapService } from './admin-bootstrap.service.js';

function build(env: Record<string, string> = {}) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 1 }),
    },
  };
  const service = new AdminBootstrapService(
    prisma as unknown as PrismaService,
    new ConfigService(env),
  );
  return { service, prisma };
}

describe('AdminBootstrapService', () => {
  it('crea el administrador por defecto con la contraseña cifrada', async () => {
    const { service, prisma } = build();

    await service.onApplicationBootstrap();

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      email: 'admin@campus.com',
      document: 'ADMIN-0001',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    expect(data.passwordHash).not.toBe('Admin2026*');
    await expect(bcrypt.compare('Admin2026*', data.passwordHash)).resolves.toBe(
      true,
    );
  });

  it('no toca una cuenta que ya existe', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 1 });

    await service.onApplicationBootstrap();

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('se puede desactivar con ADMIN_BOOTSTRAP=false', async () => {
    const { service, prisma } = build({ ADMIN_BOOTSTRAP: 'false' });

    await service.onApplicationBootstrap();

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('en producción exige ADMIN_PASSWORD explícita', async () => {
    const { service, prisma } = build({ NODE_ENV: 'production' });

    await service.onApplicationBootstrap();

    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('respeta el correo y la contraseña configurados', async () => {
    const { service, prisma } = build({
      ADMIN_EMAIL: 'Root@Campus.com',
      ADMIN_PASSWORD: 'OtraClave2026*',
    });

    await service.onApplicationBootstrap();

    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.email).toBe('root@campus.com');
    await expect(
      bcrypt.compare('OtraClave2026*', data.passwordHash),
    ).resolves.toBe(true);
  });
});
