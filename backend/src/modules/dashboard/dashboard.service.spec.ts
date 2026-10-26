import { ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import type { CourseAccessService } from '../course-access/course-access.service.js';
import type { DashboardRepository } from './dashboard.repository.js';
import { DashboardService } from './dashboard.service.js';

const teacher = { id: 7, role: Role.TEACHER } as AuthenticatedUser;
const admin = { id: 1, role: Role.ADMIN } as AuthenticatedUser;
const now = new Date('2026-10-06T12:00:00.000Z');

function build() {
  const repository = {
    courseCountsByStatus: vi.fn().mockResolvedValue(new Map([['PUBLISHED', 2], ['DRAFT', 1]])),
    findCourses: vi.fn().mockResolvedValue([
      { id: 1, title: 'Angular', status: 'PUBLISHED' },
      { id: 2, title: 'Nest', status: 'PUBLISHED' },
      { id: 3, title: 'Borrador', status: 'DRAFT' },
    ]),
    // 10 inscritos: 4 activos, 5 completados, 1 cancelado.
    enrollmentCountsByStatus: vi.fn().mockResolvedValue(new Map([['ACTIVE', 4], ['COMPLETED', 5], ['CANCELLED', 1]])),
    enrollmentCountsByCourse: vi.fn().mockResolvedValue([
      { courseId: 1, status: 'ACTIVE', total: 3 },
      { courseId: 1, status: 'COMPLETED', total: 3 },
      { courseId: 2, status: 'ACTIVE', total: 1 },
      { courseId: 2, status: 'COMPLETED', total: 2 },
      { courseId: 2, status: 'CANCELLED', total: 1 },
    ]),
    countInactive: vi.fn().mockResolvedValue(1),
    countStudents: vi.fn().mockResolvedValue(8),
    enrollmentSeries: vi.fn().mockResolvedValue([]),
    completionSeries: vi.fn().mockResolvedValue([]),
    quizStats: vi.fn().mockResolvedValue({ attempts: 10, average: 72, passed: 7 }),
    averageScoreByCourse: vi.fn().mockResolvedValue([{ courseId: 1, average: 80 }]),
    countPendingReviews: vi.fn().mockResolvedValue(3),
    countPendingSubmissions: vi.fn().mockResolvedValue(4),
    // Curso 1: 9 reseñas con 5,0 y curso 2: 1 reseña con 1,0.
    ratingByCourse: vi.fn().mockResolvedValue([
      { courseId: 1, average: 5, count: 9 },
      { courseId: 2, average: 1, count: 1 },
    ]),
  };
  const access = { assertCanManage: vi.fn().mockResolvedValue({}) };
  const service = new DashboardService(
    repository as unknown as DashboardRepository,
    access as unknown as CourseAccessService,
  );

  return { service, repository, access };
}

describe('DashboardService.teacher', () => {
  it('calcula la finalización: inscritos, completados, en progreso, inactivos y cancelados', async () => {
    const { service } = build();

    const result = await service.teacher(teacher, { period: '30d' }, now);

    expect(result.completion).toMatchObject({
      enrolled: 10,
      completed: 5,
      inProgress: 3, // 4 activos - 1 inactivo
      inactive: 1,
      cancelled: 1,
      rate: 56, // 5 de los 9 que no cancelaron
    });
    expect(result.students).toBe(8);
  });

  it('resume cursos, quizzes y pendientes de revisión', async () => {
    const { service } = build();

    const result = await service.teacher(teacher, {}, now);

    expect(result.courses).toEqual({ total: 3, published: 2, draft: 1, archived: 0 });
    expect(result.quizzes).toEqual({ attempts: 10, averageScore: 72, passRate: 70, pendingReview: 3 });
    expect(result.assignments).toEqual({ pendingGrading: 4 });
    // Promedio ponderado por cantidad de reseñas: (45 + 1) / 10.
    expect(result.rating).toEqual({ average: 4.6, count: 10 });
  });

  it('desglosa por curso, con su tasa y nota promedio (null si no hay intentos)', async () => {
    const { service } = build();

    const { courseBreakdown } = await service.teacher(teacher, {}, now);

    expect(courseBreakdown[0]).toMatchObject({ id: 1, enrolled: 6, completed: 3, completionRate: 50, averageScore: 80 });
    expect(courseBreakdown[1]).toMatchObject({ id: 2, enrolled: 4, cancelled: 1, completionRate: 67, averageScore: null });
    expect(courseBreakdown[2]).toMatchObject({ id: 3, enrolled: 0, completionRate: 0 });
    expect(courseBreakdown[0].rating).toEqual({ average: 5, count: 9 });
    expect(courseBreakdown[2].rating).toEqual({ average: null, count: 0 }); // sin reseñas
  });

  it('un docente mide solo sus cursos; un admin, todos', async () => {
    const { service, repository } = build();

    await service.teacher(teacher, {}, now);
    await service.teacher(admin, {}, now);

    expect(repository.findCourses).toHaveBeenNthCalledWith(1, { teacherId: 7, courseId: undefined });
    expect(repository.findCourses).toHaveBeenNthCalledWith(2, { teacherId: undefined, courseId: undefined });
  });

  it('con courseId comprueba que pueda gestionar ese curso', async () => {
    const { service, access, repository } = build();
    access.assertCanManage.mockRejectedValue(new ForbiddenException());

    await expect(service.teacher(teacher, { courseId: 9 }, now)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.findCourses).not.toHaveBeenCalled();
  });

  it('el periodo limita por fecha y elige día o mes para la serie', async () => {
    const { service, repository } = build();

    const week = await service.teacher(teacher, { period: '7d' }, now);
    const all = await service.teacher(teacher, { period: 'all' }, now);

    expect(week.bucket).toBe('day');
    expect(week.series).toHaveLength(8); // 7 días atrás hasta hoy
    expect(repository.countStudents).toHaveBeenNthCalledWith(1, expect.anything(), new Date('2026-09-29T12:00:00.000Z'));
    expect(all.bucket).toBe('month');
    expect(all.since).toBeNull();
  });

  it('sin inscripciones nada se divide entre cero', async () => {
    const { service, repository } = build();
    repository.enrollmentCountsByStatus.mockResolvedValue(new Map());
    repository.quizStats.mockResolvedValue({ attempts: 0, average: 0, passed: 0 });

    const result = await service.teacher(teacher, {}, now);

    expect(result.completion).toMatchObject({ enrolled: 0, rate: 0, inProgress: 0 });
    expect(result.quizzes.passRate).toBe(0);
  });
});


describe('DashboardService.students', () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    enrollmentId: 1, userId: 5, firstName: 'Ana', lastName: 'Ruiz', email: 'ana@campus.com',
    courseId: 1, courseTitle: 'Angular', enrolledAt: new Date('2026-09-01T00:00:00Z'), completedAt: null,
    totalLessons: 8, doneLessons: 2, lastActivityAt: new Date('2026-10-01T00:00:00Z'),
    quizAverage: 80, taskAverage: null, state: 'IN_PROGRESS', ...overrides,
  });

  function setup(rows: unknown[] = [row()], total = rows.length) {
    const built = build();
    const students = vi.fn().mockResolvedValue({ items: rows, total });

    Object.assign(built.repository, { students });

    return { ...built, repository: { ...built.repository, students } };
  }

  it('devuelve cada inscripción con su avance en porcentaje y sus notas', async () => {
    const { service } = setup();

    const result = await service.students(teacher, {}, now);

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      student: { id: 5, firstName: 'Ana', email: 'ana@campus.com' },
      course: { id: 1, title: 'Angular' },
      state: 'IN_PROGRESS',
      progress: { completed: 2, total: 8, percent: 25 },
      quizAverage: 80,
      taskAverage: null,
    });
  });

  it('un curso sin lecciones da 0 % y el porcentaje nunca pasa de 100', async () => {
    const { service } = setup([row({ totalLessons: 0, doneLessons: 0 }), row({ enrollmentId: 2, totalLessons: 3, doneLessons: 5 })]);

    const result = await service.students(teacher, {}, now);

    expect(result.items.map((item) => item.progress.percent)).toEqual([0, 100]);
  });

  it('un docente ve solo lo suyo; un admin, todo; y se pasan los filtros y la paginación', async () => {
    const { service, repository } = setup();

    await service.students(teacher, { period: '30d', state: 'INACTIVE', q: ' ana ', limit: 20, offset: 40 }, now);
    expect(repository.students).toHaveBeenLastCalledWith(
      { teacherId: 7, courseId: undefined },
      expect.objectContaining({ state: 'INACTIVE', q: ' ana ', take: 20, skip: 40, since: expect.any(Date) }),
    );

    await service.students(admin, {}, now);
    expect(repository.students).toHaveBeenLastCalledWith(
      { teacherId: undefined, courseId: undefined },
      expect.objectContaining({ take: 50, skip: 0, since: undefined }),
    );
  });

  it('el límite de inactividad es de 30 días antes de ahora', async () => {
    const { service, repository } = setup();

    await service.students(teacher, {}, now);

    const filter = repository.students.mock.calls[0][1] as { cutoff: Date };

    expect(filter.cutoff.toISOString()).toBe('2026-09-06T12:00:00.000Z');
  });

  it('un curso que no es del docente se rechaza (403) y no consulta nada', async () => {
    const { service, repository, access } = setup();
    access.assertCanManage.mockRejectedValue(new ForbiddenException());

    await expect(service.students(teacher, { courseId: 99 }, now)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.students).not.toHaveBeenCalled();
  });
});

describe('DashboardService.ratings', () => {
  function setup(groups: { rating: number; count: number }[], recent: unknown[] = []) {
    const built = build();

    Object.assign(built.repository, { ratingBreakdown: vi.fn().mockResolvedValue({ groups, recent }) });

    return built;
  }

  it('reparte las reseñas de 5 a 1 estrellas con su porcentaje y el promedio', async () => {
    const { service } = setup([{ rating: 5, count: 6 }, { rating: 4, count: 2 }, { rating: 1, count: 2 }]);

    const result = await service.ratings(teacher, {}, now);

    expect(result.count).toBe(10);
    expect(result.average).toBe(4);
    expect(result.distribution).toEqual([
      { stars: 5, count: 6, percent: 60 },
      { stars: 4, count: 2, percent: 20 },
      { stars: 3, count: 0, percent: 0 },
      { stars: 2, count: 0, percent: 0 },
      { stars: 1, count: 2, percent: 20 },
    ]);
  });

  it('sin reseñas: promedio null y todo en cero', async () => {
    const { service } = setup([]);

    const result = await service.ratings(teacher, {}, now);

    expect(result.average).toBeNull();
    expect(result.count).toBe(0);
    expect(result.distribution.every((d) => d.count === 0 && d.percent === 0)).toBe(true);
  });

  it('las recientes traen el nombre del estudiante y el curso', async () => {
    const { service } = setup([{ rating: 5, count: 1 }], [
      { id: 1, rating: 5, comment: 'Muy bueno', createdAt: now, user: { firstName: 'Ana', lastName: 'Ruiz' }, course: { id: 1, title: 'Angular' } },
    ]);

    const result = await service.ratings(teacher, {}, now);

    expect(result.recent[0]).toMatchObject({ student: 'Ana Ruiz', comment: 'Muy bueno', course: { title: 'Angular' } });
  });

  it('un curso ajeno se rechaza (403)', async () => {
    const { service, access } = setup([]);
    access.assertCanManage.mockRejectedValue(new ForbiddenException());

    await expect(service.ratings(teacher, { courseId: 99 }, now)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
