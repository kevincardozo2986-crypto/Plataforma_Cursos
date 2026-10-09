import { BadRequestException, ConflictException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
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
  signatureUrl: null, design: { title: 'Certificado', body: 'Curso {{course}}', accentColor: '#1F3A8A', layout: 'CLASSIC' },
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
  };
  const access = { assertCanManage: vi.fn().mockResolvedValue({}) };
  const users = { findById: vi.fn().mockResolvedValue({ id: 5, firstName: 'Ana', lastName: 'Ruiz' }) };
  const notifications = { notify: vi.fn().mockResolvedValue(1) };

  const service = new CertificatesService(
    repository as unknown as CertificatesRepository,
    access as unknown as CourseAccessService,
    users as unknown as UsersService,
    notifications as unknown as NotificationsService,
  );

  return { service, repository, access, users, notifications };
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

  describe('emisión', () => {
    it('emite el certificado con una copia de todo, un código válido, y avisa al estudiante', async () => {
      const { service, repository, notifications } = build();

      const { created, certificate } = await service.issueFor(5, 3);

      expect(created).toBe(true);
      expect(certificate).toBeTruthy();
      const data = repository.createCertificate.mock.calls[0][0];
      expect(data).toMatchObject({
        studentName: 'Ana Ruiz', courseTitle: 'Angular', courseMinutes: 1200,
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

    it('un curso sin plantilla no emite nada', async () => {
      const { service, repository } = build();
      repository.findCourseForCertificate.mockResolvedValue({ ...course, certificateTemplate: null });

      expect(await service.issueFor(5, 3)).toEqual({ certificate: null, created: false });
      expect(repository.createCertificate).not.toHaveBeenCalled();
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
