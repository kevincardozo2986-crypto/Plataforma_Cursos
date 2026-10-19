import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class CertificateFontsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listOf(ownerId: number) {
    return this.prisma.certificateCustomFont.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true },
    });
  }

  find(id: number) {
    return this.prisma.certificateCustomFont.findUnique({ where: { id } });
  }

  count(ownerId: number) {
    return this.prisma.certificateCustomFont.count({ where: { ownerId } });
  }

  create(data: { name: string; fileName: string; ownerId: number }) {
    return this.prisma.certificateCustomFont.create({ data });
  }

  delete(id: number) {
    return this.prisma.certificateCustomFont.delete({ where: { id } });
  }

  /** Plantillas que usan la tipografía (como título o como texto). */
  templatesUsing(key: string) {
    return this.prisma.certificateTemplate.count({
      where: { OR: [{ font: key }, { bodyFont: key }] },
    });
  }

  /** Certificados ya emitidos que la llevan en su copia del diseño. */
  certificatesUsing(key: string) {
    return this.prisma.certificate.count({
      where: {
        OR: [
          { design: { path: ['font'], equals: key } },
          { design: { path: ['bodyFont'], equals: key } },
        ],
      },
    });
  }
}
