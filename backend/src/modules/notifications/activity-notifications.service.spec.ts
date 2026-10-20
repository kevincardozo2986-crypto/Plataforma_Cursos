import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service.js';
import { ActivityNotificationsService } from './activity-notifications.service.js';
function build() {
  const prisma = {
    course: {
      findUnique: vi
        .fn()
        .mockResolvedValue({
          id: 1,
          title: 'Angular',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
        }),
    },
    user: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([{ id: 5 }])
        .mockResolvedValue([]),
    },
    enrollment: { findMany: vi.fn().mockResolvedValue([]) },
    notification: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  const service = new ActivityNotificationsService(
    prisma as unknown as PrismaService,
  );
  return { service, prisma };
}
describe('ActivityNotificationsService', () => {
  it('notifies active students about a public published course with a stable duplicate key', async () => {
    const { service, prisma } = build();
    await service.coursePublished(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: 'STUDENT', status: 'ACTIVE' }),
      }),
    );
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          type: 'NEW_COURSE',
          userId: 5,
          courseId: 1,
          eventKey: 'new-course:1:5',
        }),
      ],
    });
  });
  it.each([
    { status: 'DRAFT', visibility: 'PUBLIC' },
    { status: 'PUBLISHED', visibility: 'PRIVATE' },
    { status: 'PUBLISHED', visibility: 'PASSWORD' },
  ])('does not announce inaccessible courses %o', async (fields) => {
    const { service, prisma } = build();
    prisma.course.findUnique.mockResolvedValue({
      id: 1,
      title: 'Hidden',
      ...fields,
    });
    await service.coursePublished(1);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
  it('sends a password notice only to its owner and without a course link', async () => {
    const { service, prisma } = build();
    await service.passwordChanged(5);
    const data = prisma.notification.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 5, type: 'PASSWORD_CHANGED' });
    expect(data).not.toHaveProperty('courseId');
    expect(data).not.toHaveProperty('password');
  });
  it('filters cancelled/completed enrollments, inactive accounts, empty courses and recent study', async () => {
    const { service, prisma } = build();
    await service.remindInactive(new Date('2026-10-19T12:00:00Z'));
    expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
          user: { role: 'STUDENT', status: 'ACTIVE' },
          enrolledAt: { lte: new Date('2026-10-12T12:00:00Z') },
          lessonProgress: {
            none: { completedAt: { gt: new Date('2026-10-12T12:00:00Z') } },
          },
        }),
      }),
    );
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
  it('uses the last completed lesson as the reminder period, falling back to enrollment', async () => {
    const { service, prisma } = build();
    const enrolledAt = new Date('2026-09-01T12:00:00Z');
    const completedAt = new Date('2026-10-01T12:00:00Z');
    prisma.enrollment.findMany.mockResolvedValueOnce([
      {
        id: 10,
        userId: 5,
        courseId: 1,
        enrolledAt,
        course: { title: 'Angular' },
        lessonProgress: [{ completedAt }],
      },
      {
        id: 11,
        userId: 5,
        courseId: 2,
        enrolledAt,
        course: { title: 'CSS' },
        lessonProgress: [],
      },
    ]);
    await service.remindInactive(new Date('2026-10-19T12:00:00Z'));
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          eventKey: 'reminder:10:2026-10-01T12:00:00.000Z',
          type: 'COURSE_REMINDER',
          courseId: 1,
        }),
        expect.objectContaining({
          eventKey: 'reminder:11:2026-09-01T12:00:00.000Z',
          type: 'COURSE_REMINDER',
          courseId: 2,
        }),
      ],
    });
  });
  it('does not interrupt the main action when notification storage fails', async () => {
    const { service, prisma } = build();
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    prisma.notification.create.mockRejectedValue(new Error('offline'));
    await expect(service.passwordChanged(5)).resolves.toBeUndefined();
    log.mockRestore();
  });
});
