import { Injectable } from '@nestjs/common';

import { managedBy } from '../../common/prisma/managed-by.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  CertificateLayout,
  CertificateProvider,
  CertificateStatus,
  PokStatus,
} from '../../generated/prisma/enums.js';
import type { CertificateDesign } from './certificate-pdf.js';
import type { CertificateStyle } from './certificate-style.js';

export interface TemplateData {
  name?: string;
  title?: string;
  body?: string;
  accentColor?: string;
  layout?: CertificateLayout;
  font?: string;
  bodyFont?: string;
  style?: CertificateStyle;
  backgroundUrl?: string | null;
}

export interface NewCertificate {
  code: string;
  studentName: string;
  studentDocument: string | null;
  courseTitle: string;
  courseMinutes: number | null;
  instructorName: string;
  signatureUrl: string | null;
  design: CertificateDesign;
  courseId: number;
  userId: number;
  provider?: CertificateProvider;
  pokTemplateId?: string | null;
}

const templateSelect = {
  id: true,
  name: true,
  title: true,
  body: true,
  accentColor: true,
  layout: true,
  font: true,
  bodyFont: true,
  style: true,
  backgroundUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ownerSelect = { id: true, firstName: true, lastName: true } as const;

@Injectable()
export class CertificatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // --- Plantillas ---

  createTemplate(ownerId: number, data: Required<Omit<TemplateData, 'backgroundUrl'>> & { backgroundUrl: string | null }) {
    return this.prisma.certificateTemplate.create({
      data: { ...data, style: data.style as Prisma.InputJsonValue, ownerId },
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
      data: { ...data, style: data.style as Prisma.InputJsonValue | undefined },
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
          select: { title: true, body: true, accentColor: true, layout: true, font: true, bodyFont: true, style: true, backgroundUrl: true },
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
        provider: true,
        pokStatus: true,
        pokUrl: true,
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
          studentDocument: true,
          courseId: true,
          courseTitle: true,
          issuedAt: true,
          revokedAt: true,
          provider: true,
          pokStatus: true,
          pokError: true,
          user: { select: { id: true, email: true } },
        },
      }),
      this.prisma.certificate.count({ where }),
    ]);

    return { items, total };
  }

  /** Lo que se puede corregir de un certificado emitido, y la copia del diseño al actualizarlo. */
  updateCertificate(
    id: number,
    data: {
      studentName?: string;
      studentDocument?: string | null;
      courseTitle?: string;
      courseMinutes?: number | null;
      instructorName?: string;
      signatureUrl?: string | null;
      design?: CertificateDesign;
    },
  ) {
    return this.prisma.certificate.update({
      where: { id },
      data: { ...data, design: data.design as unknown as Prisma.InputJsonValue | undefined },
    });
  }

  // --- POK ---

  /** El certificado con los datos de la persona, para enviarlo a POK. */
  findForPok(id: number) {
    return this.prisma.certificate.findUnique({
      where: { id },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
  }

  findPokTemplate(courseId: number) {
    return this.prisma.pokCourseTemplate.findUnique({ where: { courseId } });
  }

  setPokTemplate(courseId: number, pokTemplateId: string, pokTemplateName: string) {
    return this.prisma.pokCourseTemplate.upsert({
      where: { courseId },
      create: { courseId, pokTemplateId, pokTemplateName },
      update: { pokTemplateId, pokTemplateName },
    });
  }

  clearPokTemplate(courseId: number) {
    return this.prisma.pokCourseTemplate.deleteMany({ where: { courseId } });
  }

  /** Los cursos del docente (`managerId`) o, sin él (admin), de todos, con su diseño de POK y cuántos certificados faltan por enviar. */
  listCoursesForPok(managerId?: number) {
    return this.prisma.course.findMany({
      where: managerId ? managedBy(managerId) : {},
      orderBy: { title: 'asc' },
      select: {
        id: true,
        title: true,
        status: true,
        pokTemplate: { select: { pokTemplateId: true, pokTemplateName: true } },
        _count: {
          select: { certificates: { where: { provider: 'POK', status: 'VALID', pokCredentialId: null, pokStatus: { in: ['NONE', 'FAILED'] } } } },
        },
      },
    });
  }

  /** Certificados de POK, vigentes, de un curso que todavía no están allá. */
  async unsentCertificateIds(courseId: number, take: number): Promise<number[]> {
    const rows = await this.prisma.certificate.findMany({
      where: { courseId, provider: 'POK', status: 'VALID', pokCredentialId: null, pokStatus: { in: ['NONE', 'FAILED'] } },
      orderBy: { id: 'asc' },
      take,
      select: { id: true },
    });

    return rows.map((row) => row.id);
  }

  findByPokCredentialId(pokCredentialId: string) {
    return this.prisma.certificate.findUnique({ where: { pokCredentialId } });
  }

  setPok(
    id: number,
    data: {
      pokStatus?: PokStatus;
      pokCredentialId?: string | null;
      pokState?: string | null;
      pokError?: string | null;
      pokUrl?: string | null;
    },
  ) {
    return this.prisma.certificate.update({
      where: { id },
      data: { ...data, pokSyncedAt: new Date() },
      select: { id: true, pokStatus: true, pokError: true },
    });
  }

  revoke(id: number) {
    return this.prisma.certificate.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }
}
