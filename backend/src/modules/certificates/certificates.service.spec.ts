import type { LearningPolicyService } from '../learning-policy/learning-policy.service.js';
import { BadRequestException, ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import type { CertificateFontsService } from '../certificate-fonts/certificate-fonts.service.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { UsersService } from '../users/users.service.js';
import { CODE_PATTERN } from './certificate-text.js';
import type { CertificatesRepository } from './certificates.repository.js';
import { CertificatesService, MAX_TEMPLATES } from './certificates.service.js';

const owner = { id: 7, role: Role.TEACHER } as AuthenticatedUser;
const other = { id: 8, role: Role.TEACHER } as AuthenticatedUser;
const admin = { id: 1, role: Role.ADMIN } as AuthenticatedUser;
const student = { id: 5, role: Role.STUDENT } as AuthenticatedUser;

const template = { id: 12, name: 'Mi plantilla', title: 'Certificado', body: 'Curso {{course}}', accentColor: '#1F3A8A', layout: 'CLASSIC', ownerId: 7 };

const course = {
  id: 3, title: 'Angular', durationMinutes: 1200,
  certificateTemplate: { title: 'Certificado', body: 'Curso {{course}}', accentColor: '#1F3A8A', layout: 'CLASSIC' },
  teacher: { id: 7, firstName: 'Laura', lastName: 'Gómez', profile: { publicName: 'Dra. Laura Gómez', signatureUrl: '/api/uploads/a1b2c3d4e5f60718293a4b5c6d7e8f90.webp' } },
};

const stored = {
  id: 40, code: 'CC-7F3K-9QXA-B2MD', status: 'VALID', userId: 5, courseId: 3,
  studentName: 'Ana Ruiz', courseTitle: 'Angular', courseMinutes: 1200, instructorName: 'Laura Gómez',
  studentDocument: '1234567890', signatureUrl: null, design: { title: 'Certificado', body: 'Curso {{course}}', accentColor: '#1F3A8A', layout: 'CLASSIC' },
  issuedAt: new Date('2026-10-09T15:00:00.000Z'),
};

function build() {
  const repository = {
    createTemplate: vi.fn((_o: number, data: object) => Promise.resolve({ id: 12, ownerId: 7, ...data })),
    findTemplate: vi.fn().mockResolvedValue(template),
    listTemplates: vi.fn().mockResolvedValue([]),
    countTemplatesOf: vi.fn().mockResolvedValue(0),
    updateTemplate: vi.fn().mockResolvedValue(template),
    deleteTemplate: vi.fn().mockResolvedValue({}),
    countCoursesUsing: vi.fn().mockResolvedValue(0),
    findPerson: vi.fn().mockResolvedValue({ firstName: 'Laura', lastName: 'Gómez', profile: null }),
    findCourseForCertificate: vi.fn().mockResolvedValue(course),
    completedWithoutCertificate: vi.fn().mockResolvedValue([]),
    createCertificate: vi.fn((data: { code: string }) => Promise.resolve({ id: 40, ...data })),
    findByCourseAndUser: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(stored),
    findByCode: vi.fn(),
    findMine: vi.fn().mockResolvedValue([]),
    findForManagers: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    revoke: vi.fn().mockResolvedValue({ ...stored, status: 'REVOKED' }),
    updateCertificate: vi.fn().mockResolvedValue({}),
  };
  const access = { assertCanManage: vi.fn().mockResolvedValue({}) };
  const users = { findById: vi.fn().mockResolvedValue({ id: 5, firstName: 'Ana', lastName: 'Ruiz', document: '1234567890' }) };
  const notifications = { notify: vi.fn().mockResolvedValue(1) };
  const fonts = {
    assertUsable: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn().mockResolvedValue({ regular: 'Helvetica', bold: 'Helvetica-Bold' }),
  };

  const service = new CertificatesService(
    repository as unknown as CertificatesRepository,
    access as unknown as CourseAccessService,
    users as unknown as UsersService,
    notifications as unknown as NotificationsService,
    fonts as unknown as CertificateFontsService,
    { completion: vi.fn().mockResolvedValue({ eligible: true }) } as unknown as LearningPolicyService,
  );

  return { service, repository, access, users, notifications, fonts };
}

describe('CertificatesService', () => {
  describe('plantillas', () => {
    it('crea una plantilla con valores por defecto si solo se da el nombre', async () => {
      const { service, repository } = build();

      await service.createTemplate(owner, { name: 'Básica' });

      expect(repository.createTemplate).toHaveBeenCalledWith(7, expect.objectContaining({
        name: 'Básica', title: 'Certificado de finalización', accentColor: '#1F3A8A', layout: 'CLASSIC',
        body: expect.stringContaining('{{course}}'),
      }));
    });

    it('rechaza marcadores mal escritos y dice cuáles son los válidos', async () => {
      const { service, repository } = build();

      const error = await service.createTemplate(owner, { name: 'Mala', body: 'Para {{estudiante}} por {{course}}' }).catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toContain('{{estudiante}}');
      expect(error.message).toContain('{{student}}');
      expect(repository.createTemplate).not.toHaveBeenCalled();
    });

    it(`limita a ${MAX_TEMPLATES} plantillas por docente`, async () => {
      const { service, repository } = build();
      repository.countTemplatesOf.mockResolvedValue(MAX_TEMPLATES);

      await expect(service.createTemplate(owner, { name: 'Otra' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cada docente ve solo las suyas; un admin, todas', async () => {
      const { service, repository } = build();

      await service.listTemplates(owner);
      await service.listTemplates(admin);

      expect(repository.listTemplates).toHaveBeenNthCalledWith(1, 7);
      expect(repository.listTemplates).toHaveBeenNthCalledWith(2, undefined);
    });

    it('la plantilla de otro docente no se ve, edita, borra ni previsualiza (403); un admin sí', async () => {
      const { service } = build();

      await expect(service.getTemplate(other, 12)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.updateTemplate(other, 12, { name: 'Robada' })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.removeTemplate(other, 12)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.assertUsable(other, 12)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.getTemplate(admin, 12)).resolves.toBeDefined();
    });

    it('una plantilla inexistente responde 404', async () => {
      const { service, repository } = build();
      repository.findTemplate.mockResolvedValue(null);

      await expect(service.getTemplate(owner, 99)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('no se borra una plantilla que usa algún curso, y dice cuántos', async () => {
      const { service, repository } = build();
      repository.countCoursesUsing.mockResolvedValue(2);

      const error = await service.removeTemplate(owner, 12).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toContain('2 cursos');
      expect(repository.deleteTemplate).not.toHaveBeenCalled();
    });

    it('una plantilla sin uso se borra', async () => {
      const { service } = build();

      await expect(service.removeTemplate(owner, 12)).resolves.toEqual({ deleted: true });
    });

    it('la vista previa es un PDF con marca de agua', async () => {
      const { service } = build();

      const { pdf, fileName } = await service.previewTemplate(owner, 12);

      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(fileName).toBe('vista-previa-certificado-mi-plantilla.pdf');
    });
  });

  describe('tipografías', () => {
    it('una plantilla nueva usa Helvetica en títulos y texto si no se elige otra', async () => {
      const { service, repository } = build();

      await service.createTemplate(owner, { name: 'Básica' });

      expect(repository.createTemplate).toHaveBeenCalledWith(7, expect.objectContaining({ font: 'SANS', bodyFont: 'SANS' }));
    });

    it('guarda la tipografía de títulos y la del texto por separado, y las valida con quien edita', async () => {
      const { service, repository, fonts } = build();

      await service.createTemplate(owner, { name: 'Mixta', font: 'great-vibes', bodyFont: 'custom:4' });

      expect(fonts.assertUsable).toHaveBeenCalledWith(owner, 'great-vibes');
      expect(fonts.assertUsable).toHaveBeenCalledWith(owner, 'custom:4');
      expect(repository.createTemplate).toHaveBeenCalledWith(7, expect.objectContaining({ font: 'great-vibes', bodyFont: 'custom:4' }));
    });

    it('una tipografía que no existe o es de otro docente rechaza la plantilla (y no se guarda nada)', async () => {
      const { service, repository, fonts } = build();
      fonts.assertUsable.mockRejectedValue(new BadRequestException('La tipografía elegida no existe'));

      await expect(service.createTemplate(owner, { name: 'Mala', font: 'custom:99' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updateTemplate(owner, 12, { bodyFont: 'custom:99' })).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createTemplate).not.toHaveBeenCalled();
      expect(repository.updateTemplate).not.toHaveBeenCalled();
    });

    it('editar sin tocar la tipografía no la vuelve a validar', async () => {
      const { service, fonts } = build();

      await service.updateTemplate(owner, 12, { name: 'Otro nombre' });

      expect(fonts.assertUsable).not.toHaveBeenCalled();
    });

    it('al emitir, el certificado guarda las dos tipografías de la plantilla', async () => {
      const { service, repository } = build();
      repository.findCourseForCertificate.mockResolvedValue({
        ...course,
        certificateTemplate: { ...course.certificateTemplate, font: 'playfair-display', bodyFont: 'lora' },
      });

      await service.issueFor(5, 3);

      expect((repository.createCertificate.mock.calls[0][0] as unknown as { design: object }).design).toMatchObject({ font: 'playfair-display', bodyFont: 'lora' });
    });

    it('un certificado antiguo (una sola tipografía) usa esa misma para el texto', async () => {
      const { service, repository, fonts } = build();
      repository.findById.mockResolvedValue({ ...stored, design: { ...stored.design, font: 'SERIF' } });

      await service.pdf(student, 40);

      expect(fonts.resolve).toHaveBeenCalledWith('SERIF');
      expect(fonts.resolve).toHaveBeenCalledTimes(2);
      expect(fonts.resolve.mock.calls.map(([key]) => key)).toEqual(['SERIF', 'SERIF']);
    });
  });


  describe('estilo de los textos', () => {
    it('una plantilla nueva sin estilo guarda uno vacío (todo por defecto)', async () => {
      const { service, repository } = build();

      await service.createTemplate(owner, { name: 'Básica' });

      expect(repository.createTemplate).toHaveBeenCalledWith(7, expect.objectContaining({ style: {} }));
    });

    it('guarda el estilo limpio: lo inventado se descarta y los tamaños se acotan', async () => {
      const { service, repository } = build();

      await service.createTemplate(owner, {
        name: 'Con estilo',
        style: { title: { italic: true, size: 500, color: '#aabbcc' }, name: { size: 100 }, showDocument: false },
      } as never);

      expect(repository.createTemplate).toHaveBeenCalledWith(7, expect.objectContaining({
        style: { title: { italic: true, size: 140, color: '#AABBCC' }, showDocument: false },
      }));
    });

    it('editar el estilo lo reemplaza completo; editar otra cosa no lo toca', async () => {
      const { service, repository } = build();

      await service.updateTemplate(owner, 12, { style: { body: { bold: true } } } as never);
      expect(repository.updateTemplate).toHaveBeenLastCalledWith(12, expect.objectContaining({ style: { body: { bold: true } } }));

      await service.updateTemplate(owner, 12, { name: 'Otro nombre' });
      expect(repository.updateTemplate.mock.calls.at(-1)?.[1]).not.toHaveProperty('style');
    });

    it('al emitir, el certificado guarda una copia del estilo de la plantilla', async () => {
      const { service, repository } = build();
      repository.findCourseForCertificate.mockResolvedValue({
        ...course,
        certificateTemplate: { ...course.certificateTemplate, style: { name: { italic: true }, showDocument: false } },
      });

      await service.issueFor(5, 3);

      expect((repository.createCertificate.mock.calls[0][0] as unknown as { design: { style: object } }).design.style).toEqual({ name: { italic: true }, showDocument: false });
    });

    it('una plantilla antigua sin estilo emite con estilo vacío', async () => {
      const { service, repository } = build();

      await service.issueFor(5, 3);

      expect((repository.createCertificate.mock.calls[0][0] as unknown as { design: { style: object } }).design.style).toEqual({});
    });
  });

  describe('plantilla con imagen propia', () => {
    const url = '/api/uploads/a1b2c3d4e5f60718293a4b5c6d7e8f90.png';

    it('el diseño IMAGE necesita la imagen de fondo (400 si falta) y con ella se guarda', async () => {
      const { service, repository } = build();

      await expect(service.createTemplate(owner, { name: 'Mía', layout: 'IMAGE' })).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createTemplate).not.toHaveBeenCalled();

      await service.createTemplate(owner, { name: 'Mía', layout: 'IMAGE', backgroundUrl: url });

      expect(repository.createTemplate).toHaveBeenCalledWith(7, expect.objectContaining({ layout: 'IMAGE', backgroundUrl: url }));
    });

    it('con otro diseño no se guarda imagen de fondo aunque se envíe', async () => {
      const { service, repository } = build();

      await service.createTemplate(owner, { name: 'Normal', layout: 'CLASSIC', backgroundUrl: url });

      expect(repository.createTemplate).toHaveBeenCalledWith(7, expect.objectContaining({ backgroundUrl: null }));
    });

    it('pasar a IMAGE una plantilla sin imagen se rechaza; si ya tenía imagen, vale', async () => {
      const { service, repository } = build();

      await expect(service.updateTemplate(owner, 12, { layout: 'IMAGE' })).rejects.toBeInstanceOf(BadRequestException);

      repository.findTemplate.mockResolvedValue({ ...template, layout: 'IMAGE', backgroundUrl: url });
      await expect(service.updateTemplate(owner, 12, { name: 'Otro nombre' })).resolves.toBeDefined();
      await expect(service.updateTemplate(owner, 12, { backgroundUrl: null })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cambiar a otro diseño borra la imagen de fondo', async () => {
      const { service, repository } = build();

      repository.findTemplate.mockResolvedValue({ ...template, layout: 'IMAGE', backgroundUrl: url });
      await service.updateTemplate(owner, 12, { layout: 'CLASSIC' });

      expect(repository.updateTemplate).toHaveBeenCalledWith(12, expect.objectContaining({ layout: 'CLASSIC', backgroundUrl: null }));
    });

    it('al emitir, el certificado guarda la imagen de fondo de la plantilla', async () => {
      const { service, repository } = build();

      repository.findCourseForCertificate.mockResolvedValue({
        ...course,
        certificateTemplate: { ...course.certificateTemplate, layout: 'IMAGE', backgroundUrl: url },
      });

      await service.issueFor(5, 3);

      const [data] = repository.createCertificate.mock.calls[0] as unknown as [{ design: { layout: string; backgroundUrl: string } }];

      expect(data.design).toMatchObject({ layout: 'IMAGE', backgroundUrl: url });
    });
  });

  describe('emisión', () => {
    it('emite el certificado con una copia de todo, un código válido, y avisa al estudiante', async () => {
      const { service, repository, notifications } = build();

      const { created, certificate } = await service.issueFor(5, 3);

      expect(created).toBe(true);
      expect(certificate).toBeTruthy();
      const data = repository.createCertificate.mock.calls[0][0];
      expect(data).toMatchObject({
        studentName: 'Ana Ruiz', studentDocument: '1234567890', courseTitle: 'Angular', courseMinutes: 1200,
        instructorName: 'Dra. Laura Gómez', // el nombre público del docente
        signatureUrl: '/api/uploads/a1b2c3d4e5f60718293a4b5c6d7e8f90.webp',
        courseId: 3, userId: 5,
        design: { title: 'Certificado', body: 'Curso {{course}}', accentColor: '#1F3A8A', layout: 'CLASSIC' },
      });
      expect(data.code).toMatch(CODE_PATTERN);
      expect(notifications.notify).toHaveBeenCalledWith([5], {
        type: 'CERTIFICATE_ISSUED', title: '¡Obtuviste tu certificado!', message: 'Completaste «Angular»', courseId: 3, refId: 40,
      });
    });

    it('es idempotente: si ya lo tiene, devuelve ese y no emite ni avisa de nuevo', async () => {
      const { service, repository, notifications } = build();
      repository.findByCourseAndUser.mockResolvedValue(stored);

      const result = await service.issueFor(5, 3);

      expect(result).toEqual({ certificate: stored, created: false });
      expect(repository.createCertificate).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('un curso aprobado sin plantilla usa el certificado predeterminado', async () => {
      const { service, repository } = build();
      repository.findCourseForCertificate.mockResolvedValue({ ...course, certificateTemplate: null });

      expect((await service.issueFor(5, 3)).created).toBe(true);
      expect(repository.createCertificate).toHaveBeenCalledWith(expect.objectContaining({design: expect.objectContaining({font: 'SANS', layout: 'CLASSIC'})}));
    });

    it('sin nombre público usa nombre y apellido del docente', async () => {
      const { service, repository } = build();
      repository.findCourseForCertificate.mockResolvedValue({ ...course, teacher: { ...course.teacher, profile: null } });

      await service.issueFor(5, 3);

      expect(repository.createCertificate.mock.calls[0][0]).toMatchObject({ instructorName: 'Laura Gómez', signatureUrl: null });
    });

    it('si el código ya existe por casualidad, prueba con otro', async () => {
      const { service, repository } = build();
      repository.createCertificate
        .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
        .mockImplementation((data: { code: string }) => Promise.resolve({ id: 41, ...data }));

      const { created } = await service.issueFor(5, 3);

      expect(created).toBe(true);
      expect(repository.createCertificate).toHaveBeenCalledTimes(2);
      const [first, second] = repository.createCertificate.mock.calls.map(([d]) => d.code);
      expect(first).not.toBe(second);
    });

    it('dos emisiones a la vez para la misma persona: gana la primera, sin error', async () => {
      const { service, repository } = build();
      repository.createCertificate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
      repository.findByCourseAndUser.mockResolvedValueOnce(null).mockResolvedValueOnce(stored);

      expect((await service.issueFor(5, 3)).certificate).toBe(stored);
    });

    it('un error real de la base no se esconde', async () => {
      const { service, repository } = build();
      repository.createCertificate.mockRejectedValue(new Error('base caída'));

      await expect(service.issueFor(5, 3)).rejects.toThrow('base caída');
    });

    it('tryIssue registra el fallo pero no lo propaga (completar una lección no debe romperse)', async () => {
      const { service, repository } = build();
      const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      repository.createCertificate.mockRejectedValue(new Error('base caída'));

      await expect(service.tryIssue(5, 3)).resolves.toBeUndefined();
      expect(log).toHaveBeenCalled();
      log.mockRestore();
    });

    it('issueMissing emite a quienes ya completaron y cuenta solo los nuevos', async () => {
      const { service, repository } = build();
      repository.completedWithoutCertificate.mockResolvedValue([5, 6, 7]);
      repository.findByCourseAndUser.mockResolvedValueOnce(null).mockResolvedValueOnce(stored).mockResolvedValueOnce(null);

      expect(await service.issueMissing(3)).toBe(2);
    });

    it('issueMissing sigue con los demás aunque uno falle', async () => {
      const { service, repository } = build();
      const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      repository.completedWithoutCertificate.mockResolvedValue([5, 6]);
      repository.createCertificate.mockRejectedValueOnce(new Error('falló uno')).mockImplementation((d: { code: string }) => Promise.resolve({ id: 41, ...d }));

      expect(await service.issueMissing(3)).toBe(1);
      log.mockRestore();
    });
  });

  describe('verificación pública', () => {
    const found = { code: 'CC-7F3K-9QXA-B2MD', status: 'VALID', studentName: 'Ana Ruiz', courseTitle: 'Angular', courseMinutes: 1200, instructorName: 'Laura Gómez', issuedAt: new Date(), revokedAt: null };

    it('un código vigente es válido y muestra a quién se emitió', async () => {
      const { service, repository } = build();
      repository.findByCode.mockResolvedValue(found);

      await expect(service.verify('cc-7f3k-9qxa-b2md')).resolves.toMatchObject({ valid: true, status: 'VALID', studentName: 'Ana Ruiz', courseTitle: 'Angular' });
      expect(repository.findByCode).toHaveBeenCalledWith('CC-7F3K-9QXA-B2MD');
    });

    it('uno revocado existe pero no es válido', async () => {
      const { service, repository } = build();
      repository.findByCode.mockResolvedValue({ ...found, status: 'REVOKED', revokedAt: new Date() });

      await expect(service.verify(found.code)).resolves.toMatchObject({ valid: false, status: 'REVOKED' });
    });

    it('no revela datos internos (ids, correo)', async () => {
      const { service, repository } = build();
      repository.findByCode.mockResolvedValue(found);

      const json = JSON.stringify(await service.verify(found.code));

      expect(json).not.toMatch(/userId|courseId|email|"id"/);
    });

    it('un código inexistente o mal formado responde 404, sin consultar la base si ni tiene forma', async () => {
      const { service, repository } = build();
      repository.findByCode.mockResolvedValue(null);

      await expect(service.verify('CC-2222-3333-4444')).rejects.toBeInstanceOf(NotFoundException);
      repository.findByCode.mockClear();
      await expect(service.verify("'; DROP TABLE certificates;--")).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findByCode).not.toHaveBeenCalled();
    });
  });

  describe('descarga del PDF', () => {
    it('el dueño lo descarga', async () => {
      const { service } = build();

      const { pdf, fileName } = await service.pdf(student, 40);

      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(fileName).toBe('certificado-angular.pdf');
    });

    it('quien gestiona el curso también', async () => {
      const { service, access } = build();

      await expect(service.pdf(owner, 40)).resolves.toBeDefined();
      expect(access.assertCanManage).toHaveBeenCalledWith(owner, 3);
    });

    it('cualquier otra persona recibe 404, como si no existiera', async () => {
      const { service, access } = build();
      access.assertCanManage.mockRejectedValue(new ForbiddenException());

      await expect(service.pdf({ id: 6, role: Role.STUDENT } as AuthenticatedUser, 40)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('un certificado revocado ya no lo descarga su dueño, pero el docente lo ve con la marca', async () => {
      const { service, repository } = build();
      repository.findById.mockResolvedValue({ ...stored, status: 'REVOKED' });

      await expect(service.pdf(student, 40)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.pdf(owner, 40)).resolves.toBeDefined();
    });

    it('un certificado inexistente responde 404', async () => {
      const { service, repository } = build();
      repository.findById.mockResolvedValue(null);

      await expect(service.pdf(student, 99)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('corregir un certificado emitido', () => {
    it('quien gestiona el curso corrige el nombre y el documento; el código no cambia', async () => {
      const { service, repository, access } = build();

      await service.editIssued(owner, 40, { studentName: 'Ana María Ruiz', studentDocument: '1020304050' });

      expect(access.assertCanManage).toHaveBeenCalledWith(owner, 3);
      expect(repository.updateCertificate).toHaveBeenCalledWith(40, { studentName: 'Ana María Ruiz', studentDocument: '1020304050' });
    });

    it('solo cambia lo que se envía', async () => {
      const { service, repository } = build();

      await service.editIssued(owner, 40, { studentName: 'Solo el nombre' });
      expect(repository.updateCertificate).toHaveBeenLastCalledWith(40, { studentName: 'Solo el nombre' });

      await service.editIssued(owner, 40, { studentDocument: null });
      expect(repository.updateCertificate).toHaveBeenLastCalledWith(40, { studentDocument: null });
    });

    it('un cuerpo vacío se rechaza (400) y no escribe nada', async () => {
      const { service, repository } = build();

      await expect(service.editIssued(owner, 40, {})).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.updateCertificate).not.toHaveBeenCalled();
    });

    it('quien no gestiona el curso no puede (403) y uno que no existe da 404', async () => {
      const { service, repository, access } = build();
      access.assertCanManage.mockRejectedValue(new ForbiddenException());

      await expect(service.editIssued(other, 40, { studentName: 'Robado' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.updateCertificate).not.toHaveBeenCalled();

      repository.findById.mockResolvedValue(null);
      await expect(service.editIssued(owner, 99, { studentName: 'x y' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('actualizar el diseño vuelve a copiar la plantilla actual, el curso y el docente, sin tocar al estudiante', async () => {
      const { service, repository } = build();
      repository.findCourseForCertificate.mockResolvedValue({
        ...course,
        title: 'Angular 2.0',
        certificateTemplate: { ...course.certificateTemplate, title: 'Nuevo título', font: 'lora', bodyFont: 'lora', style: { name: { italic: true } } },
      });

      await service.refreshDesign(owner, 40);

      const [id, data] = repository.updateCertificate.mock.calls[0] as unknown as [number, Record<string, unknown>];

      expect(id).toBe(40);
      expect(data).toMatchObject({
        courseTitle: 'Angular 2.0',
        courseMinutes: 1200,
        instructorName: 'Dra. Laura Gómez',
        design: { title: 'Nuevo título', font: 'lora', bodyFont: 'lora', style: { name: { italic: true } } },
      });
      expect(data).not.toHaveProperty('studentName');
      expect(data).not.toHaveProperty('studentDocument');
      expect(data).not.toHaveProperty('code');
    });

    it('si el curso ya no tiene plantilla, no se puede actualizar (400)', async () => {
      const { service, repository } = build();
      repository.findCourseForCertificate.mockResolvedValue({ ...course, certificateTemplate: null });

      await expect(service.refreshDesign(owner, 40)).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.updateCertificate).not.toHaveBeenCalled();
    });

    it('quien no gestiona el curso no puede actualizar el diseño (403)', async () => {
      const { service, access } = build();
      access.assertCanManage.mockRejectedValue(new ForbiddenException());

      await expect(service.refreshDesign(other, 40)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('revocar y listar', () => {
    it('quien gestiona el curso revoca; revocar uno ya revocado no repite nada', async () => {
      const { service, repository } = build();

      await service.revoke(owner, 40);
      expect(repository.revoke).toHaveBeenCalledWith(40);

      repository.revoke.mockClear();
      repository.findById.mockResolvedValue({ ...stored, status: 'REVOKED' });
      await service.revoke(owner, 40);
      expect(repository.revoke).not.toHaveBeenCalled();
    });

    it('quien no gestiona el curso no puede revocar', async () => {
      const { service, access, repository } = build();
      access.assertCanManage.mockRejectedValue(new ForbiddenException());

      await expect(service.revoke(other, 40)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.revoke).not.toHaveBeenCalled();
    });

    it('el docente lista los de sus cursos (admin: todos), y filtra por curso solo si lo gestiona', async () => {
      const { service, repository, access } = build();

      await service.listIssued(owner, { status: 'VALID' });
      await service.listIssued(admin, {});
      expect(repository.findForManagers).toHaveBeenNthCalledWith(1, { managerId: 7, courseId: undefined, status: 'VALID', take: 20, skip: 0 });
      expect(repository.findForManagers).toHaveBeenNthCalledWith(2, { managerId: undefined, courseId: undefined, status: undefined, take: 20, skip: 0 });

      access.assertCanManage.mockRejectedValue(new ForbiddenException());
      await expect(service.listIssued(other, { courseId: 3 })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un estudiante ve sus propios certificados', async () => {
      const { service, repository } = build();

      await service.mine(student);

      expect(repository.findMine).toHaveBeenCalledWith(5);
    });
  });
});
