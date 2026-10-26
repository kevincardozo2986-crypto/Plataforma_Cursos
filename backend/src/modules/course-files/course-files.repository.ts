import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class CourseFilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(courseId: number) {
    return this.prisma.courseFile.findMany({
      where: { courseId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  count(courseId: number) {
    return this.prisma.courseFile.count({ where: { courseId } });
  }

  findById(id: number) {
    return this.prisma.courseFile.findUnique({ where: { id } });
  }

  findByStoredName(storedName: string) {
    return this.prisma.courseFile.findUnique({ where: { storedName } });
  }

  /** ¿Algún otro uso (una entrega) tiene ya este archivo? Lo decide el servicio con su propio repositorio. */
  create(data: { courseId: number; storedName: string; originalName: string; size: number; position: number }) {
    return this.prisma.courseFile.create({ data });
  }

  delete(id: number) {
    return this.prisma.courseFile.delete({ where: { id } });
  }

  async namesOfCourse(courseId: number): Promise<string[]> {
    const rows = await this.prisma.courseFile.findMany({ where: { courseId }, select: { storedName: true } });

    return rows.map((row) => row.storedName);
  }
}
