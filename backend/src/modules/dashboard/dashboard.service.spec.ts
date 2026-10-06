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
  });

  it('desglosa por curso, con su tasa y nota promedio (null si no hay intentos)', async () => {
    const { service } = build();

    const { courseBreakdown } = await service.teacher(teacher, {}, now);

    expect(courseBreakdown[0]).toMatchObject({ id: 1, enrolled: 6, completed: 3, completionRate: 50, averageScore: 80 });
    expect(courseBreakdown[1]).toMatchObject({ id: 2, enrolled: 4, cancelled: 1, completionRate: 67, averageScore: null });
    expect(courseBreakdown[2]).toMatchObject({ id: 3, enrolled: 0, completionRate: 0 });
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
