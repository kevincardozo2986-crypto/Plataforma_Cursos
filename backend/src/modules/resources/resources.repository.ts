import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { ResourceType } from '../../generated/prisma/enums.js';

interface ResourceData {
  title?: string;
  type?: ResourceType;
  url?: string;
}

@Injectable()
export class ResourcesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByLesson(lessonId: number) {
    return this.prisma.resource.findMany({
      where: { lessonId },
      orderBy: { id: 'asc' },
    });
  }

  create(data: ResourceData & { lessonId: number; title: string; url: string }) {
    return this.prisma.resource.create({ data });
  }

  update(id: number, data: ResourceData) {
    return this.prisma.resource.update({ where: { id }, data });
  }

  delete(id: number) {
    return this.prisma.resource.delete({ where: { id } });
  }
}
