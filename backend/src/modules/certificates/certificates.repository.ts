import { Injectable } from '@nestjs/common';

import { managedBy } from '../../common/prisma/managed-by.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { CertificateStatus } from '../../generated/prisma/enums.js';
import type { CertificateDesign } from './certificate-pdf.js';

export interface TemplateData {
  name?: string;
  title?: string;
  body?: string;
  accentColor?: string;
  layout?: 'CLASSIC' | 'MODERN';
}

export interface NewCertificate {
  code: string;
  studentName: string;
  courseTitle: string;
  courseMinutes: number | null;
  instructorName: string;
  signatureUrl: string | null;
  design: CertificateDesign;
  courseId: number;
  userId: number;
}

const templateSelect = {
  id: true,
  name: true,
  title: true,
  body: true,
  accentColor: true,
  layout: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ownerSelect = { id: true, firstName: true, lastName: true } as const;

@Injectable()
export class CertificatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // --- Plantillas ---

  createTemplate(ownerId: number, data: Required<TemplateData>) {
    return this.prisma.certificateTemplate.create({
      data: { ...data, ownerId },
      select: { ...templateSelect, ownerId: true },
    });
  }

  findTemplate(id: number) {
    return this.prisma.certificateTemplate.findUnique({
      where: { id },
      select: { ...templateSelect, ownerId: true },
    });
  }

  /** Las plantillas de un docente; sin `ownerId` (admin), todas, con su dueño. */
  listTemplates(ownerId?: number) {
    return this.prisma.certificateTemplate.findMany({
      where: ownerId === undefined ? {} : { ownerId },
      orderBy: { updatedAt: 'desc' },
      select: {
        ...templateSelect,
        ownerId: true,
        owner: { select: ownerSelect },
        _count: { select: { courses: true } },
      },
    });
  }

  countTemplatesOf(ownerId: number) {
    return this.prisma.certificateTemplate.count({ where: { ownerId } });
  }

  updateTemplate(id: number, data: TemplateData) {
    return this.prisma.certificateTemplate.update({
      where: { id },
      data,
      select: { ...templateSelect, ownerId: true },
    });
  }

  deleteTemplate(id: number) {
    return this.prisma.certificateTemplate.delete({ where: { id } });
  }

  countCoursesUsing(templateId: number) {
    return this.prisma.course.count({ where: { certificateTemplateId: templateId } });
  }

  /** Autor del curso con su firma y nombre público (también para la vista previa). */
  findPerson(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...ownerSelect,
        profile: { select: { publicName: true, signatureUrl: true } },
      },
    });
  }

  // --- Datos del curso al emitir (solo lectura) ---

  findCourseForCertificate(courseId: number) {
    return this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        durationMinutes: true,
        certificateTemplate: {
          select: { title: true, body: true, accentColor: true, layout: true },
        },
        teacher: {
          select: {
            ...ownerSelect,
            profile: { select: { publicName: true, signatureUrl: true } },
          },
        },
      },
    });
  }

  /** Ids de quienes completaron el curso y todavía no tienen certificado. */
  async completedWithoutCertificate(courseId: number): Promise<number[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: {
        courseId,
        status: 'COMPLETED',
        user: { certificates: { none: { courseId } } },
      },
      select: { userId: true },
    });

    return rows.map((row) => row.userId);
  }

  // --- Certificados ---

  createCertificate(data: NewCertificate) {
    return this.prisma.certificate.create({
      data: { ...data, design: data.design as unknown as Prisma.InputJsonValue },
    });
  }

  findByCourseAndUser(courseId: number, userId: number) {
    return this.prisma.certificate.findUnique({
      where: { courseId_userId: { courseId, userId } },
    });
  }

  findById(id: number) {
    return this.prisma.certificate.findUnique({ where: { id } });
  }

  findByCode(code: string) {
    return this.prisma.certificate.findUnique({
      where: { code },
      select: {
        code: true,
        status: true,
        studentName: true,
        courseTitle: true,
        courseMinutes: true,
        instructorName: true,
        issuedAt: true,
        revokedAt: true,
      },
    });
  }

  findMine(userId: number) {
    return this.prisma.certificate.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        code: true,
        status: true,
        courseId: true,
        courseTitle: true,
        instructorName: true,
        issuedAt: true,
      },
    });
  }

  /** Certificados de los cursos del docente (`managerId`) o, sin él (admin), de todos. */
  async findForManagers(options: {
    managerId?: number;
    courseId?: number;
    status?: CertificateStatus;
    take: number;
    skip: number;
  }) {
    const where: Prisma.CertificateWhereInput = {
      courseId: options.courseId,
      status: options.status,
      ...(options.managerId ? { course: managedBy(options.managerId) } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.certificate.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        take: options.take,
        skip: options.skip,
        select: {
          id: true,
          code: true,
          status: true,
          studentName: true,
          courseId: true,
          courseTitle: true,
          issuedAt: true,
          revokedAt: true,
          user: { select: { id: true, email: true } },
        },
      }),
      this.prisma.certificate.count({ where }),
    ]);

    return { items, total };
  }

  revoke(id: number) {
    return this.prisma.certificate.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }
}
