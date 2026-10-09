import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { join } from 'node:path';
import sharp from 'sharp';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { uploadsDir } from '../uploads/upload-paths.js';
import { UsersService } from '../users/users.service.js';
import {
  type CertificateDesign,
  renderCertificatePdf,
} from './certificate-pdf.js';
import {
  DEFAULT_BODY,
  DEFAULT_TITLE,
  findUnknownPlaceholders,
  generateCode,
  normalizeCode,
  PLACEHOLDERS,
  pdfFileName,
} from './certificate-text.js';
import { CertificatesRepository } from './certificates.repository.js';
import type {
  CreateCertificateTemplateDto,
  ListCertificatesQueryDto,
  UpdateCertificateTemplateDto,
} from './dto/certificate.dto.js';

/** Máximo de plantillas por docente. */
export const MAX_TEMPLATES = 50;

const DEFAULT_COLOR = '#1F3A8A';

/** La firma solo se lee de las imágenes subidas a esta plataforma. */
const SIGNATURE_FILE = /^\/api\/uploads\/([a-f0-9]{32}\.(?:png|jpe?g|webp|gif))$/;

const isUniqueViolation = (error: unknown) =>
  (error as { code?: string } | null)?.code === 'P2002';

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly repository: CertificatesRepository,
    private readonly access: CourseAccessService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- Plantillas (docente) ---

  /** Las plantillas del docente (un admin ve todas). */
  listTemplates(user: AuthenticatedUser) {
    return this.repository.listTemplates(
      user.role === Role.ADMIN ? undefined : user.id,
    );
  }

  async createTemplate(user: AuthenticatedUser, dto: CreateCertificateTemplateDto) {
    this.assertValidBody(dto.body);

    if ((await this.repository.countTemplatesOf(user.id)) >= MAX_TEMPLATES) {
      throw new BadRequestException(
        `Puedes tener hasta ${MAX_TEMPLATES} plantillas; borra alguna que no uses`,
      );
    }

    return this.repository.createTemplate(user.id, {
      name: dto.name,
      title: dto.title ?? DEFAULT_TITLE,
      body: dto.body ?? DEFAULT_BODY,
      accentColor: dto.accentColor ?? DEFAULT_COLOR,
      layout: dto.layout ?? 'CLASSIC',
    });
  }

  getTemplate(user: AuthenticatedUser, id: number) {
    return this.ownedTemplate(user, id);
  }

  async updateTemplate(
    user: AuthenticatedUser,
    id: number,
    dto: UpdateCertificateTemplateDto,
  ) {
    await this.ownedTemplate(user, id);
    this.assertValidBody(dto.body);

    return this.repository.updateTemplate(id, dto);
  }

  /** No se borra una plantilla que algún curso usa: dejaría a ese curso sin certificado. */
  async removeTemplate(user: AuthenticatedUser, id: number) {
    await this.ownedTemplate(user, id);

    const used = await this.repository.countCoursesUsing(id);

    if (used > 0) {
      throw new ConflictException(
        `Esta plantilla está asignada a ${used} ${used === 1 ? 'curso' : 'cursos'}; quítala de ${used === 1 ? 'ese curso' : 'esos cursos'} antes de borrarla`,
      );
    }

    await this.repository.deleteTemplate(id);

    return { deleted: true };
  }

  /** Para el módulo de cursos: ¿puede este docente asignar esta plantilla a un curso? */
  async assertUsable(user: AuthenticatedUser, templateId: number) {
    await this.ownedTemplate(user, templateId);
  }

  /** PDF de ejemplo con la firma y el nombre de quien diseña, y la marca "VISTA PREVIA". */
  async previewTemplate(user: AuthenticatedUser, id: number) {
    const template = await this.ownedTemplate(user, id);
    const person = await this.repository.findPerson(user.id);
    const name = person
      ? (person.profile?.publicName ?? `${person.firstName} ${person.lastName}`)
      : 'Docente';

    const pdf = await renderCertificatePdf({
      design: {
        title: template.title,
        body: template.body,
        accentColor: template.accentColor,
        layout: template.layout,
      },
      studentName: 'Nombre del Estudiante',
      courseTitle: 'Nombre del curso',
      courseMinutes: 1200,
      instructorName: name,
      issuedAt: new Date(),
      code: 'CC-XXXX-XXXX-XXXX',
      verifyUrl: this.verifyUrl('CC-XXXX-XXXX-XXXX'),
      signature: await this.signatureBuffer(person?.profile?.signatureUrl ?? null),
      preview: true,
    });

    return { pdf, fileName: `vista-previa-${pdfFileName(template.name)}` };
  }

  // --- Emisión ---

  /**
   * Emite el certificado de quien completó un curso, si el curso tiene plantilla. Es idempotente:
   * si ya lo tiene, devuelve el que existe. `created` dice si se emitió ahora.
   */
  async issueFor(userId: number, courseId: number) {
    const course = await this.repository.findCourseForCertificate(courseId);

    if (!course?.certificateTemplate) {
      return { certificate: null, created: false };
    }

    const existing = await this.repository.findByCourseAndUser(courseId, userId);

    if (existing) {
      return { certificate: existing, created: false };
    }

    const student = await this.users.findById(userId);

    if (!student) {
      return { certificate: null, created: false };
    }

    const { teacher, certificateTemplate: template } = course;
    const design: CertificateDesign = {
      title: template.title,
      body: template.body,
      accentColor: template.accentColor,
      layout: template.layout,
    };

    const certificate = await this.createWithUniqueCode({
      studentName: `${student.firstName} ${student.lastName}`,
      courseTitle: course.title,
      courseMinutes: course.durationMinutes,
      instructorName:
        teacher.profile?.publicName ?? `${teacher.firstName} ${teacher.lastName}`,
      signatureUrl: teacher.profile?.signatureUrl ?? null,
      design,
      courseId,
      userId,
    });

    await this.notifications.notify([userId], {
      type: 'CERTIFICATE_ISSUED',
      title: '¡Obtuviste tu certificado!',
      message: `Completaste «${course.title}»`,
      courseId,
      refId: certificate.id,
    });

    return { certificate, created: true };
  }

  /** Igual que `issueFor`, pero un fallo se registra y no rompe lo que lo originó (completar una lección). */
  async tryIssue(userId: number, courseId: number): Promise<void> {
    try {
      await this.issueFor(userId, courseId);
    } catch (error) {
      this.logger.error(
        `No se pudo emitir el certificado (usuario ${userId}, curso ${courseId}): ${(error as Error).message}`,
      );
    }
  }

  /**
   * Emite el certificado a quienes ya completaron el curso antes de que se le asignara una
   * plantilla. Devuelve cuántos se emitieron.
   */
  async issueMissing(courseId: number): Promise<number> {
    let issued = 0;

    for (const userId of await this.repository.completedWithoutCertificate(courseId)) {
      try {
        if ((await this.issueFor(userId, courseId)).created) {
          issued += 1;
        }
      } catch (error) {
        this.logger.error(
          `No se pudo emitir el certificado (usuario ${userId}, curso ${courseId}): ${(error as Error).message}`,
        );
      }
    }

    return issued;
  }

  // --- Consulta ---

  mine(user: AuthenticatedUser) {
    return this.repository.findMine(user.id);
  }

  /** Comprobación pública: cualquiera con el código ve a quién se emitió y si sigue vigente. */
  async verify(rawCode: string) {
    const code = normalizeCode(rawCode);
    const certificate = code ? await this.repository.findByCode(code) : null;

    if (!certificate) {
      throw new NotFoundException('No encontramos un certificado con ese código');
    }

    const { status, revokedAt, ...data } = certificate;

    return { valid: status === 'VALID', status, revokedAt, ...data };
  }

  /** Certificados emitidos en los cursos del docente (un admin ve todos). */
  async listIssued(user: AuthenticatedUser, query: ListCertificatesQueryDto) {
    if (query.courseId !== undefined) {
      await this.access.assertCanManage(user, query.courseId);
    }

    return this.repository.findForManagers({
      managerId: user.role === Role.ADMIN ? undefined : user.id,
      courseId: query.courseId,
      status: query.status,
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    });
  }

  /**
   * El PDF lo descarga su dueño o quien gestiona el curso; para cualquier otra persona "no existe".
   * Un certificado revocado ya no lo descarga su dueño; quien gestiona el curso lo ve con la marca.
   */
  async pdf(user: AuthenticatedUser, id: number) {
    const certificate = await this.repository.findById(id);

    if (!certificate) {
      throw new NotFoundException('El certificado no existe');
    }

    const isOwner = certificate.userId === user.id;

    if (!isOwner) {
      try {
        await this.access.assertCanManage(user, certificate.courseId);
      } catch {
        throw new NotFoundException('El certificado no existe');
      }
    }

    if (isOwner && certificate.status === 'REVOKED') {
      throw new ForbiddenException('Este certificado fue revocado');
    }

    const pdf = await renderCertificatePdf({
      design: certificate.design as unknown as CertificateDesign,
      studentName: certificate.studentName,
      courseTitle: certificate.courseTitle,
      courseMinutes: certificate.courseMinutes,
      instructorName: certificate.instructorName,
      issuedAt: certificate.issuedAt,
      code: certificate.code,
      verifyUrl: this.verifyUrl(certificate.code),
      signature: await this.signatureBuffer(certificate.signatureUrl),
      revoked: certificate.status === 'REVOKED',
    });

    return { pdf, fileName: pdfFileName(certificate.courseTitle) };
  }

  /** Anula un certificado (por ejemplo, si se descubre un fraude). Lo hace quien gestiona el curso. */
  async revoke(user: AuthenticatedUser, id: number) {
    const certificate = await this.repository.findById(id);

    if (!certificate) {
      throw new NotFoundException('El certificado no existe');
    }

    await this.access.assertCanManage(user, certificate.courseId);

    if (certificate.status === 'REVOKED') {
      return certificate;
    }

    return this.repository.revoke(id);
  }

  // --- Internos ---

  private async ownedTemplate(user: AuthenticatedUser, id: number) {
    const template = await this.repository.findTemplate(id);

    if (!template) {
      throw new NotFoundException('La plantilla no existe');
    }

    if (user.role !== Role.ADMIN && template.ownerId !== user.id) {
      throw new ForbiddenException('Esa plantilla es de otro docente');
    }

    return template;
  }

  /** Rechaza marcadores mal escritos como {{estudiante}}, que saldrían tal cual en el certificado. */
  private assertValidBody(body: string | undefined) {
    const unknown = body ? findUnknownPlaceholders(body) : [];

    if (unknown.length > 0) {
      throw new BadRequestException(
        `Marcadores desconocidos: ${unknown.map((name) => `{{${name}}}`).join(', ')}. Los válidos son ${PLACEHOLDERS.map((name) => `{{${name}}}`).join(', ')}`,
      );
    }
  }

  /** El código es aleatorio; si por casualidad ya existe, se prueba con otro. */
  private async createWithUniqueCode(
    data: Omit<Parameters<CertificatesRepository['createCertificate']>[0], 'code'>,
  ) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.repository.createCertificate({ ...data, code: generateCode() });
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }

        // Dos emisiones a la vez para la misma persona: gana la primera.
        const existing = await this.repository.findByCourseAndUser(
          data.courseId,
          data.userId,
        );

        if (existing) {
          return existing;
        }
      }
    }

    throw new Error('No se pudo generar un código único');
  }

  private verifyUrl(code: string): string {
    return `${process.env.APP_URL ?? 'http://localhost:4200'}/verificar/${code}`;
  }

  /** La imagen de la firma como PNG, o null si no hay o no se puede leer. */
  private async signatureBuffer(url: string | null): Promise<Buffer | null> {
    const match = url ? SIGNATURE_FILE.exec(url) : null;

    if (!match) {
      return null;
    }

    try {
      return await sharp(join(uploadsDir(), match[1]))
        .resize({ width: 600, height: 300, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch {
      return null;
    }
  }
}
