import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { ProgressService } from '../progress/progress.service.js';
import type { UploadsService } from '../uploads/uploads.service.js';
import type { CourseFilesRepository } from './course-files.repository.js';
import { CourseFilesService, MAX_COURSE_FILES } from './course-files.service.js';

const teacher = { id: 7, role: Role.TEACHER } as AuthenticatedUser;
const student = { id: 5, role: Role.STUDENT } as AuthenticatedUser;
const stranger = { id: 6, role: Role.STUDENT } as AuthenticatedUser;
const STORED = 'a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf';

const row = { id: 3, courseId: 10, storedName: STORED, originalName: 'guia.pdf', size: 1234, position: 0, createdAt: new Date('2026-10-20') };

function build() {
  const repository = {
    list: vi.fn().mockResolvedValue([row]),
    count: vi.fn().mockResolvedValue(0),
    findById: vi.fn().mockResolvedValue(row),
    findByStoredName: vi.fn().mockResolvedValue(null),
    create: vi.fn((data: Record<string, unknown>) => Promise.resolve({ id: 3, createdAt: new Date(), ...data })),
    delete: vi.fn().mockResolvedValue(row),
    namesOfCourse: vi.fn().mockResolvedValue([STORED]),
  };
  const access = {
    assertCanView: vi.fn().mockResolvedValue({ id: 10 }),
    assertCanManage: vi.fn().mockResolvedValue({ id: 10 }),
  };
  const progress = { isEnrolled: vi.fn().mockResolvedValue(true) };
  const uploads = {
    privateInfo: vi.fn().mockResolvedValue({ originalName: 'guia.pdf', size: 1234, uploadedBy: 7 }),
    resolvePrivate: vi.fn().mockResolvedValue('/ruta/privada/archivo.pdf'),
    removePrivate: vi.fn().mockResolvedValue(undefined),
  };
  const service = new CourseFilesService(
    repository as unknown as CourseFilesRepository,
    access as unknown as CourseAccessService,
    progress as unknown as ProgressService,
    uploads as unknown as UploadsService,
  );

  return { service, repository, access, progress, uploads };
}

/** Quien no gestiona el curso: assertCanManage rechaza. */
const notManager = (access: { assertCanManage: ReturnType<typeof vi.fn> }) =>
  access.assertCanManage.mockRejectedValue(new ForbiddenException());

describe('CourseFilesService', () => {
  describe('list', () => {
    it('quien gestiona el curso ve los archivos, con su dirección de descarga', async () => {
      const { service } = build();

      await expect(service.list(teacher, 10)).resolves.toEqual([
        { id: 3, originalName: 'guia.pdf', size: 1234, createdAt: row.createdAt, url: '/api/course-files/3/download' },
      ]);
    });

    it('un estudiante inscrito los ve', async () => {
      const { service, access } = build();
      notManager(access);

      await expect(service.list(student, 10)).resolves.toHaveLength(1);
    });

    it('un estudiante sin inscripción recibe 403, y no consulta los archivos', async () => {
      const { service, access, progress, repository } = build();
      notManager(access);
      progress.isEnrolled.mockResolvedValue(false);

      await expect(service.list(stranger, 10)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.list).not.toHaveBeenCalled();
    });

    it('un curso que no se puede ver (borrador ajeno) responde 404', async () => {
      const { service, access } = build();
      access.assertCanView.mockRejectedValue(new NotFoundException());

      await expect(service.list(stranger, 10)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('attach', () => {
    it('adjunta un documento que subió quien lo adjunta, con su nombre original y su peso', async () => {
      const { service, repository } = build();

      await service.attach(teacher, 10, STORED);

      expect(repository.create).toHaveBeenCalledWith({
        courseId: 10, storedName: STORED, originalName: 'guia.pdf', size: 1234, position: 0,
      });
    });

    it('solo quien gestiona el curso (403 para los demás)', async () => {
      const { service, access, repository } = build();
      notManager(access);

      await expect(service.attach(student, 10, STORED)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rechaza un archivo que no existe o que subió otra persona', async () => {
      const { service, uploads } = build();

      uploads.privateInfo.mockResolvedValue(null);
      await expect(service.attach(teacher, 10, STORED)).rejects.toBeInstanceOf(BadRequestException);

      uploads.privateInfo.mockResolvedValue({ originalName: 'x.pdf', size: 1, uploadedBy: 99 });
      await expect(service.attach(teacher, 10, STORED)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un archivo que ya está adjunto en otro lugar', async () => {
      const { service, repository } = build();
      repository.findByStoredName.mockResolvedValue(row);

      await expect(service.attach(teacher, 10, STORED)).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it(`limita a ${MAX_COURSE_FILES} archivos por curso`, async () => {
      const { service, repository } = build();
      repository.count.mockResolvedValue(MAX_COURSE_FILES);

      await expect(service.attach(teacher, 10, STORED)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('borra el registro y el archivo del servidor', async () => {
      const { service, repository, uploads } = build();

      await expect(service.remove(teacher, 10, 3)).resolves.toEqual({ deleted: true });
      expect(repository.delete).toHaveBeenCalledWith(3);
      expect(uploads.removePrivate).toHaveBeenCalledWith([STORED]);
    });

    it('un archivo de otro curso o que no existe responde 404 y no borra nada', async () => {
      const { service, repository, uploads } = build();

      await expect(service.remove(teacher, 99, 3)).rejects.toBeInstanceOf(NotFoundException);
      repository.findById.mockResolvedValue(null);
      await expect(service.remove(teacher, 10, 3)).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.delete).not.toHaveBeenCalled();
      expect(uploads.removePrivate).not.toHaveBeenCalled();
    });

    it('solo quien gestiona el curso', async () => {
      const { service, access } = build();
      notManager(access);

      await expect(service.remove(student, 10, 3)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('fileForDownload', () => {
    it('un inscrito lo descarga con su nombre original', async () => {
      const { service, access } = build();
      notManager(access);

      await expect(service.fileForDownload(student, 3)).resolves.toEqual({
        path: '/ruta/privada/archivo.pdf',
        originalName: 'guia.pdf',
      });
    });

    it('quien no está inscrito recibe «no existe» (sin saber que el archivo está)', async () => {
      const { service, access, progress } = build();
      notManager(access);
      progress.isEnrolled.mockResolvedValue(false);

      await expect(service.fileForDownload(stranger, 3)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('un archivo que no existe, o cuyo archivo ya no está en el disco, responde 404', async () => {
      const { service, repository, uploads } = build();

      repository.findById.mockResolvedValue(null);
      await expect(service.fileForDownload(teacher, 3)).rejects.toBeInstanceOf(NotFoundException);

      repository.findById.mockResolvedValue(row);
      uploads.resolvePrivate.mockResolvedValue(null);
      await expect(service.fileForDownload(teacher, 3)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
