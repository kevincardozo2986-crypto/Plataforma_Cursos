import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { ProgressService } from '../progress/progress.service.js';
import type { UploadsService } from '../uploads/uploads.service.js';
import type { AssignmentsRepository } from './assignments.repository.js';
import { AssignmentsService } from './assignments.service.js';

const student = { id: 5, role: Role.STUDENT } as AuthenticatedUser;
const otherStudent = { id: 6, role: Role.STUDENT } as AuthenticatedUser;
const teacher = { id: 7, role: Role.TEACHER } as AuthenticatedUser;

const NOW = new Date('2026-10-10T12:00:00.000Z');
const FILE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90.pdf';
const OTHER_FILE = 'b1b2c3d4e5f60718293a4b5c6d7e8f91.pdf';

const assignment = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  title: 'Tarea 1',
  dueAt: null,
  allowLate: true,
  maxScore: 100,
  ...overrides,
});

function build() {
  const repository = {
    findById: vi.fn().mockResolvedValue(assignment()),
    findSubmission: vi.fn().mockResolvedValue(null),
    saveSubmission: vi.fn((data: Record<string, unknown>) =>
      Promise.resolve({ id: 9, status: 'SUBMITTED', score: null, feedback: null, submittedAt: NOW, gradedAt: null, ...data }),
    ),
    findByFileName: vi.fn().mockResolvedValue(null),
    highestScore: vi.fn().mockResolvedValue(0),
    update: vi.fn((_id: number, data: unknown) => Promise.resolve(data)),
    findDetail: vi.fn(),
    saveGrade: vi.fn().mockResolvedValue({}),
    fileNamesOfAssignment: vi.fn().mockResolvedValue([FILE]),
    delete: vi.fn().mockResolvedValue({}),
    namesOf: (files: unknown) => (Array.isArray(files) ? files.map((f: { name: string }) => f.name) : []),
  };
  const access = {
    courseIdOfAssignment: vi.fn().mockResolvedValue(10),
    courseIdOfModule: vi.fn().mockResolvedValue(10),
    assertCanView: vi.fn().mockResolvedValue({}),
    assertCanManage: vi.fn().mockResolvedValue({}),
  };
  const progress = { isEnrolled: vi.fn().mockResolvedValue(true) };
  const uploads = {
    privateInfo: vi.fn().mockResolvedValue({ originalName: 'mi tarea.pdf', size: 1234, uploadedBy: 5 }),
    resolvePrivate: vi.fn().mockResolvedValue('/ruta/privada/archivo.pdf'),
    removePrivate: vi.fn().mockResolvedValue(undefined),
  };

  const service = new AssignmentsService(
    repository as unknown as AssignmentsRepository,
    access as unknown as CourseAccessService,
    progress as unknown as ProgressService,
    uploads as unknown as UploadsService,
  );

  return { service, repository, access, progress, uploads };
}

describe('AssignmentsService', () => {
  describe('submit', () => {
    it('exige estar inscrito en el curso', async () => {
      const { service, progress } = build();
      progress.isEnrolled.mockResolvedValue(false);

      await expect(service.submit(student, 1, { text: 'hola' }, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('guarda una entrega con texto y la deja pendiente', async () => {
      const { service, repository } = build();

      const result = await service.submit(student, 1, { text: '  Mi respuesta  ' }, NOW);

      expect(repository.saveSubmission).toHaveBeenCalledWith({
        assignmentId: 1, userId: 5, text: 'Mi respuesta', files: [], late: false,
      });
      expect(result).toMatchObject({ status: 'SUBMITTED', text: 'Mi respuesta', files: [] });
    });

    it('adjunta archivos con su nombre original y una URL de descarga', async () => {
      const { service } = build();

      const result = await service.submit(student, 1, { files: [{ name: FILE }] }, NOW);

      expect(result.files).toEqual([
        { name: FILE, originalName: 'mi tarea.pdf', size: 1234, url: `/api/submission-files/${FILE}` },
      ]);
    });

    it('rechaza una entrega vacía', async () => {
      const { service } = build();

      await expect(service.submit(student, 1, { text: '   ' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un archivo que subió otra persona', async () => {
      const { service, uploads } = build();
      uploads.privateInfo.mockResolvedValue({ originalName: 'x.pdf', size: 1, uploadedBy: 99 });

      await expect(service.submit(student, 1, { files: [{ name: FILE }] }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un archivo que no existe', async () => {
      const { service, uploads } = build();
      uploads.privateInfo.mockResolvedValue(null);

      await expect(service.submit(student, 1, { files: [{ name: FILE }] }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un archivo que ya está en otra entrega', async () => {
      const { service, repository } = build();
      repository.findByFileName.mockResolvedValue({ assignmentId: 2, userId: 5 });

      await expect(service.submit(student, 1, { files: [{ name: FILE }] }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('permite reenviar con el mismo archivo de esta misma entrega', async () => {
      const { service, repository } = build();
      repository.findByFileName.mockResolvedValue({ assignmentId: 1, userId: 5 });

      await expect(service.submit(student, 1, { files: [{ name: FILE }] }, NOW)).resolves.toBeDefined();
    });

    it('una entrega calificada ya no se puede cambiar', async () => {
      const { service, repository } = build();
      repository.findSubmission.mockResolvedValue({ status: 'GRADED', files: [] });

      await expect(service.submit(student, 1, { text: 'otra' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('pasada la fecha límite: tardía si se permite, rechazada si no', async () => {
      const dueAt = new Date('2026-10-01T00:00:00.000Z');
      const { service, repository } = build();

      repository.findById.mockResolvedValue(assignment({ dueAt, allowLate: true }));
      await expect(service.submit(student, 1, { text: 'x' }, NOW)).resolves.toMatchObject({ late: true });

      repository.findById.mockResolvedValue(assignment({ dueAt, allowLate: false }));
      await expect(service.submit(student, 1, { text: 'x' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('al reenviar borra los archivos que ya no se usan, y solo esos', async () => {
      const { service, repository, uploads } = build();
      repository.findSubmission.mockResolvedValue({
        status: 'SUBMITTED',
        files: [{ name: FILE }, { name: OTHER_FILE }],
      });

      await service.submit(student, 1, { files: [{ name: FILE }] }, NOW);

      expect(uploads.removePrivate).toHaveBeenCalledWith([OTHER_FILE]);
    });
  });

  describe('gradeSubmission', () => {
    const detail = {
      id: 9, status: 'SUBMITTED', late: false, text: 'x', files: [], score: null, feedback: null,
      submittedAt: NOW, gradedAt: null,
      user: { id: 5 },
      assignment: { id: 1, title: 'Tarea 1', dueAt: null, maxScore: 50, module: { courseId: 10, course: { title: 'Curso' } } },
    };

    it('rechaza una nota fuera de 0 al máximo de la tarea', async () => {
      const { service, repository } = build();
      repository.findDetail.mockResolvedValue(detail);

      await expect(service.gradeSubmission(teacher, 9, { score: 51 })).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.saveGrade).not.toHaveBeenCalled();
    });

    it('guarda la nota y quién calificó', async () => {
      const { service, repository } = build();
      repository.findDetail.mockResolvedValue(detail);

      await service.gradeSubmission(teacher, 9, { score: 45, feedback: 'Bien' });

      expect(repository.saveGrade).toHaveBeenCalledWith(9, { score: 45, feedback: 'Bien', gradedById: 7 });
    });

    it('un docente que no gestiona el curso no puede calificar', async () => {
      const { service, repository, access } = build();
      repository.findDetail.mockResolvedValue(detail);
      access.assertCanManage.mockRejectedValue(new ForbiddenException());

      await expect(service.gradeSubmission(teacher, 9, { score: 10 })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('fileForDownload', () => {
    const owned = { userId: 5, assignmentId: 1, files: [{ name: FILE, originalName: 'mi tarea.pdf' }], assignment: { module: { courseId: 10 } } };

    it('el dueño de la entrega la descarga con su nombre original', async () => {
      const { service, repository } = build();
      repository.findByFileName.mockResolvedValue(owned);

      await expect(service.fileForDownload(student, FILE)).resolves.toEqual({
        path: '/ruta/privada/archivo.pdf',
        originalName: 'mi tarea.pdf',
      });
    });

    it('el docente del curso la descarga', async () => {
      const { service, repository } = build();
      repository.findByFileName.mockResolvedValue(owned);

      await expect(service.fileForDownload(teacher, FILE)).resolves.toBeDefined();
    });

    it('otro estudiante recibe "no existe", sin saber que el archivo está ahí', async () => {
      const { service, repository, access } = build();
      repository.findByFileName.mockResolvedValue(owned);
      access.assertCanManage.mockRejectedValue(new ForbiddenException());

      await expect(service.fileForDownload(otherStudent, FILE)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('un archivo que no está en ninguna entrega no se descarga', async () => {
      const { service } = build();

      await expect(service.fileForDownload(student, FILE)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('no deja bajar el puntaje máximo por debajo de una nota ya puesta', async () => {
      const { service, repository } = build();
      repository.highestScore.mockResolvedValue(80);

      await expect(service.update(teacher, 1, { maxScore: 70 })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.update(teacher, 1, { maxScore: 80 })).resolves.toBeDefined();
    });

    it('null en dueAt quita la fecha límite; sin enviarlo, no la toca', async () => {
      const { service, repository } = build();

      await service.update(teacher, 1, { dueAt: null });
      await service.update(teacher, 1, { title: 'Nuevo' });

      expect(repository.update).toHaveBeenNthCalledWith(1, 1, expect.objectContaining({ dueAt: null }));
      expect(repository.update).toHaveBeenNthCalledWith(2, 1, expect.objectContaining({ dueAt: undefined }));
    });
  });

  describe('remove', () => {
    it('borra la tarea y los archivos de todas sus entregas', async () => {
      const { service, uploads, repository } = build();

      await service.remove(teacher, 1);

      expect(repository.delete).toHaveBeenCalledWith(1);
      expect(uploads.removePrivate).toHaveBeenCalledWith([FILE]);
    });
  });
});
