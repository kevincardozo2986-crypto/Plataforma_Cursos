import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

interface ModuleData {
  title?: string;
  description?: string;
  position?: number;
  unlockAt?: Date | null;
  unlockAfterDays?: number | null;
}

/** Al leer, los prerrequisitos salen como una lista de ids. */
const withRequires = {
  requires: { select: { requiredModuleId: true } },
} as const;

type WithRequires<T> = T & { requires: { requiredModuleId: number }[] };

function flatten<T>({ requires, ...module }: WithRequires<T>) {
  return {
    ...module,
    requiresModuleIds: requires.map((r) => r.requiredModuleId),
  };
}

@Injectable()
export class CourseModulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Módulos de un curso con sus lecciones (lectura del árbol de contenido).
   * Con `fullLessons` (vista del docente) trae las lecciones completas y los prerrequisitos.
   */
  async findByCourse(courseId: number, fullLessons = false) {
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: { position: 'asc' },
      include: {
        lessons: {
          orderBy: { position: 'asc' },
          ...(fullLessons
            ? {}
            : {
                select: {
                  id: true,
                  title: true,
                  position: true,
                  durationMinutes: true,
                },
              }),
        },
        ...withRequires,
      },
    });

    return modules.map(flatten);
  }

  /** Un módulo con la lista de ids de los módulos que requiere. */
  async findOne(id: number) {
    const module = await this.prisma.courseModule.findUnique({
      where: { id },
      include: withRequires,
    });

    return module ? flatten(module) : null;
  }

  countByCourse(courseId: number) {
    return this.prisma.courseModule.count({ where: { courseId } });
  }

  async maxPosition(courseId: number): Promise<number> {
    const last = await this.prisma.courseModule.aggregate({
      where: { courseId },
      _max: { position: true },
    });

    return last._max.position ?? 0;
  }

  /** Ids de todos los módulos de un curso. */
  async idsByCourse(courseId: number): Promise<number[]> {
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      select: { id: true },
    });

    return modules.map((m) => m.id);
  }

  /** Lo que ya existe en el curso: módulo -> módulos que requiere. */
  async prerequisiteGraph(courseId: number): Promise<Map<number, number[]>> {
    const rows = await this.prisma.modulePrerequisite.findMany({
      where: { module: { courseId } },
    });
    const graph = new Map<number, number[]>();

    for (const { moduleId, requiredModuleId } of rows) {
      graph.set(moduleId, [...(graph.get(moduleId) ?? []), requiredModuleId]);
    }

    return graph;
  }

  async create(
    data: { courseId: number; title: string; position: number } & ModuleData,
    requiresModuleIds: number[] = [],
  ) {
    const module = await this.prisma.courseModule.create({
      data: {
        ...data,
        requires: {
          create: requiresModuleIds.map((requiredModuleId) => ({ requiredModuleId })),
        },
      },
      include: withRequires,
    });

    return flatten(module);
  }

  /** Si `requiresModuleIds` viene, reemplaza la lista completa de prerrequisitos. */
  async update(id: number, data: ModuleData, requiresModuleIds?: number[]) {
    const module = await this.prisma.courseModule.update({
      where: { id },
      data: {
        ...data,
        ...(requiresModuleIds
          ? {
              requires: {
                deleteMany: {},
                create: requiresModuleIds.map((requiredModuleId) => ({ requiredModuleId })),
              },
            }
          : {}),
      },
      include: withRequires,
    });

    return flatten(module);
  }

  delete(id: number) {
    return this.prisma.courseModule.delete({ where: { id } });
  }
}
