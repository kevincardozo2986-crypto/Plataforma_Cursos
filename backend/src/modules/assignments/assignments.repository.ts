import { Injectable } from '@nestjs/common';

import { managedBy } from '../../common/prisma/managed-by.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { SubmissionStatus } from '../../generated/prisma/enums.js';

export interface AssignmentData {
  title?: string;
  description?: string;
  dueAt?: Date | null;
  allowLate?: boolean;
  maxScore?: number;
}

/** Archivo adjunto de una entrega, tal como se guarda. */
export interface SubmissionFile {
  name: string;
  originalName: string;
  size: number;
}

const studentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

@Injectable()
export class AssignmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `userId`: incluye la entrega de ese usuario (para que el estudiante vea su estado). */
  findByModule(moduleId: number, userId: number) {
    return this.prisma.assignment.findMany({
      where: { moduleId },
      orderBy: { id: 'asc' },
      include: {
        _count: { select: { submissions: true } },
        submissions: {
          where: { userId },
          select: { status: true, score: true, late: true, submittedAt: true },
        },
      },
    });
  }

  findById(id: number) {
    return this.prisma.assignment.findUnique({ where: { id } });
  }

  create(data: AssignmentData & { moduleId: number; title: string }) {
    return this.prisma.assignment.create({ data });
  }

  update(id: number, data: AssignmentData) {
    return this.prisma.assignment.update({ where: { id }, data });
  }

  delete(id: number) {
    return this.prisma.assignment.delete({ where: { id } });
  }

  /** Nota más alta ya puesta en una tarea: no se puede bajar el máximo por debajo de ella. */
  async highestScore(assignmentId: number): Promise<number> {
    const result = await this.prisma.assignmentSubmission.aggregate({
      where: { assignmentId },
      _max: { score: true },
    });

    return result._max.score ?? 0;
  }

  async fileNamesOfAssignment(assignmentId: number): Promise<string[]> {
    const rows = await this.prisma.assignmentSubmission.findMany({
      where: { assignmentId },
      select: { files: true },
    });

    return rows.flatMap((row) => this.namesOf(row.files));
  }

  findSubmission(assignmentId: number, userId: number) {
    return this.prisma.assignmentSubmission.findUnique({
      where: { assignmentId_userId: { assignmentId, userId } },
    });
  }

  saveSubmission(data: {
    assignmentId: number;
    userId: number;
    text: string | null;
    files: SubmissionFile[];
    late: boolean;
  }) {
    const { assignmentId, userId, ...content } = data;
    const fields = {
      ...content,
      files: content.files as unknown as Prisma.InputJsonValue,
    };

    return this.prisma.assignmentSubmission.upsert({
      where: { assignmentId_userId: { assignmentId, userId } },
      create: { assignmentId, userId, ...fields },
      // Reenviar reinicia la fecha de entrega; la entrega vuelve a quedar pendiente.
      update: { ...fields, status: 'SUBMITTED', submittedAt: new Date() },
    });
  }

  /**
   * Entregas para revisar. Un docente ve las de sus cursos (`teacherId`); un admin, todas.
   * `courseId` ya debe haberse comprobado que el usuario puede gestionarlo.
   */
  async findForReview(filter: {
    teacherId?: number;
    courseId?: number;
    assignmentId?: number;
    status?: SubmissionStatus;
    take: number;
    skip: number;
  }) {
    const where: Prisma.AssignmentSubmissionWhereInput = {
      status: filter.status,
      assignmentId: filter.assignmentId,
      assignment: {
        module: {
          courseId: filter.courseId,
          course: filter.teacherId ? managedBy(filter.teacherId) : undefined,
        },
      },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.assignmentSubmission.findMany({
        where,
        // Primero lo pendiente; dentro de cada grupo, lo más reciente.
        orderBy: [{ status: 'asc' }, { submittedAt: 'desc' }],
        take: filter.take,
        skip: filter.skip,
        select: {
          id: true,
          status: true,
          late: true,
          score: true,
          submittedAt: true,
          gradedAt: true,
          user: { select: studentSelect },
          assignment: {
            select: {
              id: true,
              title: true,
              maxScore: true,
              module: {
                select: { course: { select: { id: true, title: true } } },
              },
            },
          },
        },
      }),
      this.prisma.assignmentSubmission.count({ where }),
    ]);

    return { items, total };
  }

  findDetail(id: number) {
    return this.prisma.assignmentSubmission.findUnique({
      where: { id },
      include: {
        user: { select: studentSelect },
        assignment: {
          select: {
            id: true,
            title: true,
            dueAt: true,
            maxScore: true,
            module: {
              select: { courseId: true, course: { select: { title: true } } },
            },
          },
        },
      },
    });
  }

  saveGrade(
    id: number,
    data: { score: number; feedback?: string; gradedById: number },
  ) {
    return this.prisma.assignmentSubmission.update({
      where: { id },
      data: { ...data, status: 'GRADED', gradedAt: new Date() },
    });
  }

  /** La entrega que contiene un archivo, para decidir quién puede descargarlo. */
  findByFileName(name: string) {
    return this.prisma.assignmentSubmission.findFirst({
      where: { files: { array_contains: [{ name }] } },
      select: {
        userId: true,
        assignmentId: true,
        files: true,
        assignment: { select: { module: { select: { courseId: true } } } },
      },
    });
  }

  namesOf(files: unknown): string[] {
    return Array.isArray(files)
      ? (files as SubmissionFile[]).map((file) => file.name)
      : [];
  }
}
