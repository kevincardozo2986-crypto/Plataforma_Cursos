import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { ProgressService } from '../progress/progress.service.js';
import type { DiscussionsRepository } from './discussions.repository.js';
import { DiscussionsService } from './discussions.service.js';

const student = { id: 5, role: Role.STUDENT } as AuthenticatedUser;
const other = { id: 6, role: Role.STUDENT } as AuthenticatedUser;
const teacher = { id: 7, role: Role.TEACHER } as AuthenticatedUser;
const admin = { id: 1, role: Role.ADMIN } as AuthenticatedUser;

const course = { id: 3, title: 'Angular', teacherId: 7, qaEnabled: true };

const question = { id: 20, kind: 'QUESTION', courseId: 3, lessonId: null, authorId: 5, parentId: null, answered: false };

function build() {
  const repository = {
    createPost: vi.fn((data: object) => Promise.resolve({ id: 30, ...data })),
    findPost: vi.fn().mockResolvedValue(question),
    findRootWithReplies: vi.fn().mockResolvedValue({ id: 20, courseId: 3, replies: [] }),
    findRoots: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    updatePost: vi.fn().mockResolvedValue({}),
    deletePost: vi.fn().mockResolvedValue({}),
    setAnswered: vi.fn().mockResolvedValue({}),
    repliesAuthors: vi.fn().mockResolvedValue([]),
  };
  const access = {
    getCourseOrThrow: vi.fn().mockResolvedValue(course),
    canManage: vi.fn((user: AuthenticatedUser, c: { teacherId: number }) => user.role === Role.ADMIN || (user.role === Role.TEACHER && c.teacherId === user.id)),
    assertCanManage: vi.fn().mockResolvedValue(course),
    courseIdOfLesson: vi.fn().mockResolvedValue(3),
  };
  const progress = {
    isEnrolled: vi.fn((userId: number) => Promise.resolve(userId === 5 || userId === 6)),
    enrolledCourseIds: vi.fn().mockResolvedValue([3]),
  };
  const notifications = { notify: vi.fn().mockResolvedValue(1) };

  const service = new DiscussionsService(
    repository as unknown as DiscussionsRepository,
    access as unknown as CourseAccessService,
    progress as unknown as ProgressService,
    notifications as unknown as NotificationsService,
  );

  return { service, repository, access, progress, notifications };
}

describe('DiscussionsService', () => {
  describe('askQuestion', () => {
    const dto = { title: '¿Cómo instalo Angular?', body: 'No me funciona' };

    it('un estudiante inscrito pregunta y se avisa al docente', async () => {
      const { service, repository, notifications } = build();

      await service.askQuestion(student, 3, dto);

      expect(repository.createPost).toHaveBeenCalledWith({
        kind: 'QUESTION', title: dto.title, body: dto.body, courseId: 3, lessonId: undefined, authorId: 5,
      });
      expect(notifications.notify).toHaveBeenCalledWith(
        [7],
        { type: 'NEW_QUESTION', title: dto.title, message: 'Nueva pregunta en «Angular»', courseId: 3, refId: 30 },
        5,
      );
    });

    it('quien no está inscrito no puede preguntar', async () => {
      const { service, progress } = build();
      progress.isEnrolled.mockResolvedValue(false);

      await expect(service.askQuestion(student, 3, dto)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('con las preguntas desactivadas en el curso se rechaza', async () => {
      const { service, access } = build();
      access.getCourseOrThrow.mockResolvedValue({ ...course, qaEnabled: false });

      await expect(service.askQuestion(student, 3, dto)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('la lección indicada debe ser del mismo curso', async () => {
      const { service, access } = build();
      access.courseIdOfLesson.mockResolvedValue(99);

      await expect(service.askQuestion(student, 3, { ...dto, lessonId: 8 })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('la pregunta le llega al autor del curso y a todos sus instructores', async () => {
      const { service, access, notifications } = build();
      access.getCourseOrThrow.mockResolvedValue({ ...course, instructorIds: [8, 9] });

      await service.askQuestion(student, 3, dto);

      expect(notifications.notify).toHaveBeenCalledWith([7, 8, 9], expect.anything(), 5);
    });

    it('un docente que pregunta en su propio curso no se avisa a sí mismo', async () => {
      const { service, notifications } = build();

      await service.askQuestion(teacher, 3, dto);

      expect(notifications.notify).toHaveBeenCalledWith([7], expect.anything(), 7);
    });
  });

  describe('comment', () => {
    it('un estudiante inscrito comenta una lección; el curso se deduce de la lección', async () => {
      const { service, repository } = build();

      await service.comment(student, 8, { body: 'Muy buena clase' });

      expect(repository.createPost).toHaveBeenCalledWith({
        kind: 'COMMENT', body: 'Muy buena clase', courseId: 3, lessonId: 8, authorId: 5,
      });
    });

    it('comentar no depende de que las preguntas estén activadas', async () => {
      const { service, access } = build();
      access.getCourseOrThrow.mockResolvedValue({ ...course, qaEnabled: false });

      await expect(service.comment(student, 8, { body: 'Hola' })).resolves.toBeDefined();
    });

    it('un docente de otro curso no puede comentar', async () => {
      const { service } = build();
      const stranger = { id: 99, role: Role.TEACHER } as AuthenticatedUser;

      await expect(service.comment(stranger, 8, { body: 'Hola' })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('reply', () => {
    it('si responde el docente del curso, la pregunta queda respondida', async () => {
      const { service, repository } = build();

      await service.reply(teacher, 20, { body: 'Con npm install' });

      expect(repository.setAnswered).toHaveBeenCalledWith(20, true);
    });

    it('un admin también la deja respondida', async () => {
      const { service, repository } = build();

      await service.reply(admin, 20, { body: 'Con npm install' });

      expect(repository.setAnswered).toHaveBeenCalledWith(20, true);
    });

    it('si responde otro estudiante, sigue sin respuesta del docente', async () => {
      const { service, repository } = build();

      await service.reply(other, 20, { body: 'A mí me pasó lo mismo' });

      expect(repository.setAnswered).not.toHaveBeenCalled();
    });

    it('avisa a quien escribió la pregunta, con un extracto de la respuesta', async () => {
      const { service, notifications } = build();

      await service.reply(teacher, 20, { body: 'Con npm install' });

      expect(notifications.notify).toHaveBeenCalledWith(
        [5],
        { type: 'NEW_REPLY', title: 'Respondieron tu pregunta', message: 'Con npm install', courseId: 3, refId: 20 },
        7,
      );
    });

    it('no se avisa a uno mismo si responde su propia pregunta', async () => {
      const { service, notifications } = build();

      await service.reply(student, 20, { body: 'Ya lo resolví' });

      expect(notifications.notify).toHaveBeenCalledWith([5], expect.anything(), 5);
    });

    it('en un comentario de lección no se marca "respondida"', async () => {
      const { service, repository } = build();
      repository.findPost.mockResolvedValue({ ...question, kind: 'COMMENT', lessonId: 8 });

      await service.reply(teacher, 20, { body: 'Gracias' });

      expect(repository.setAnswered).not.toHaveBeenCalled();
    });

    it('no se responde a una respuesta, solo a la publicación principal', async () => {
      const { service, repository } = build();
      repository.findPost.mockResolvedValue({ ...question, parentId: 20 });

      await expect(service.reply(teacher, 21, { body: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('quien no participa del curso no puede responder', async () => {
      const { service } = build();
      const stranger = { id: 99, role: Role.STUDENT } as AuthenticatedUser;

      await expect(service.reply(stranger, 20, { body: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('una publicación inexistente responde 404', async () => {
      const { service, repository } = build();
      repository.findPost.mockResolvedValue(null);

      await expect(service.reply(teacher, 99, { body: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('cada rol ve lo suyo: el estudiante sus cursos, el docente los suyos, el admin todo', async () => {
      const { service, repository } = build();

      await service.list(student, {});
      await service.list(teacher, {});
      await service.list(admin, {});

      const scopes = repository.findRoots.mock.calls.map(([options]) => options.scope);
      expect(scopes).toEqual([{ courseIds: [3] }, { teacherId: 7 }, null]);
    });

    it('un estudiante no puede pedir un curso donde no está inscrito', async () => {
      const { service } = build();

      await expect(service.list(student, { courseId: 99 })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('pasa los filtros y la paginación', async () => {
      const { service, repository } = build();

      await service.list(teacher, { kind: 'QUESTION', answered: false, lessonId: 8, limit: 5, offset: 10 });

      expect(repository.findRoots).toHaveBeenCalledWith({
        kind: 'QUESTION', courseId: undefined, lessonId: 8, answered: false, scope: { teacherId: 7 }, take: 5, skip: 10,
      });
    });
  });

  describe('findOne', () => {
    it('solo lo ven quienes participan del curso', async () => {
      const { service, progress } = build();

      await expect(service.findOne(student, 20)).resolves.toBeDefined();

      progress.isEnrolled.mockResolvedValue(false);
      await expect(service.findOne(student, 20)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('una respuesta suelta no se abre como si fuera una publicación', async () => {
      const { service, repository } = build();
      repository.findRootWithReplies.mockResolvedValue(null);

      await expect(service.findOne(student, 21)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('solo el autor edita su mensaje', async () => {
      const { service, repository } = build();

      await service.update(student, 20, { body: 'Corregido' });
      await expect(service.update(teacher, 20, { body: 'Censurado' })).rejects.toBeInstanceOf(ForbiddenException);

      expect(repository.updatePost).toHaveBeenCalledTimes(1);
    });

    it('un comentario no lleva título', async () => {
      const { service, repository } = build();
      repository.findPost.mockResolvedValue({ ...question, kind: 'COMMENT' });

      await expect(service.update(student, 20, { title: 'Algo' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('el autor puede borrar lo suyo', async () => {
      const { service, repository } = build();

      await service.remove(student, 20);

      expect(repository.deletePost).toHaveBeenCalledWith(20);
    });

    it('el docente del curso puede moderar y borrar mensajes de sus alumnos', async () => {
      const { service, repository } = build();

      await service.remove(teacher, 20);

      expect(repository.deletePost).toHaveBeenCalledWith(20);
    });

    it('otro estudiante no puede borrar el mensaje de alguien más', async () => {
      const { service, repository } = build();

      await expect(service.remove(other, 20)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repository.deletePost).not.toHaveBeenCalled();
    });

    it('al borrar la única respuesta del docente, la pregunta vuelve a "sin responder"', async () => {
      const { service, repository } = build();
      repository.findPost
        .mockResolvedValueOnce({ id: 31, kind: 'QUESTION', courseId: 3, authorId: 7, parentId: 20 }) // la respuesta
        .mockResolvedValueOnce({ ...question, answered: true }); // la pregunta, ya respondida
      repository.repliesAuthors.mockResolvedValue([{ author: { id: 6, role: Role.STUDENT } }]);

      await service.remove(teacher, 31);

      expect(repository.setAnswered).toHaveBeenCalledWith(20, false);
    });

    it('la respuesta de un instructor también cuenta como del docente', async () => {
      const { service, repository, access } = build();
      access.getCourseOrThrow.mockResolvedValue({ ...course, instructorIds: [8] });
      repository.findPost
        .mockResolvedValueOnce({ id: 31, kind: 'QUESTION', courseId: 3, authorId: 6, parentId: 20 })
        .mockResolvedValueOnce({ ...question, answered: true });
      // Se borra una respuesta de un alumno; queda una del instructor 8.
      repository.repliesAuthors.mockResolvedValue([{ author: { id: 8, role: Role.TEACHER } }]);

      await service.remove(admin, 31);

      expect(repository.setAnswered).not.toHaveBeenCalled();
    });

    it('si aún queda otra respuesta del docente, sigue respondida', async () => {
      const { service, repository } = build();
      repository.findPost
        .mockResolvedValueOnce({ id: 31, kind: 'QUESTION', courseId: 3, authorId: 7, parentId: 20 })
        .mockResolvedValueOnce({ ...question, answered: true });
      repository.repliesAuthors.mockResolvedValue([{ author: { id: 7, role: Role.TEACHER } }]);

      await service.remove(teacher, 31);

      expect(repository.setAnswered).not.toHaveBeenCalled();
    });
  });
});
