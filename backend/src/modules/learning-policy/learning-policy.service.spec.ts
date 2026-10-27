import type { PrismaService } from '../../database/prisma.service.js';
import { LearningPolicyService } from './learning-policy.service.js';
import {
  addWatchedRange,
  primaryVideo,
  watchedPercent,
} from './watch-coverage.js';

vi.mock('./local-video-duration.js', () => ({
  localVideoDuration: vi.fn().mockResolvedValue(null),
}));

function build() {
  let row: Record<string, unknown> | null = null;
  const lesson = {
    id: 1,
    videoUrl: 'https://example.com/video.mp4',
    resources: [],
  };
  const prisma = {
    lesson: {
      findUniqueOrThrow: vi.fn(async () => lesson),
      findMany: vi.fn(async () => [
        lesson,
        { id: 2, videoUrl: null, resources: [] },
      ]),
    },
    lessonProgress: {
      findMany: vi.fn(async () => [] as { lessonId: number }[]),
    },
    enrollment: {
      findUnique: vi.fn(async () => ({ id: 7, status: 'ACTIVE' })),
    },
    course: {
      findUniqueOrThrow: vi.fn(async () => ({ certificateTemplateId: 1 })),
    },
    courseModule: { findMany: vi.fn() },
    videoWatchProgress: {
      findUnique: vi.fn(async () => row),
      upsert: vi.fn(
        async ({
          create,
          update,
        }: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          row = row ? { ...row, ...update } : create;
          return row;
        },
      ),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  const service = new LearningPolicyService(prisma as unknown as PrismaService);
  return { service, prisma, lesson };
}

describe('Video viewing requirements', () => {
  it('detects editor videos without imposing a video threshold on audio resources', () => {
    expect(
      primaryVideo({
        content:
          '<iframe src="https://www.youtube.com/embed/9P0UkeGBZwQ"></iframe>',
      }),
    ).toBe('https://www.youtube.com/embed/9P0UkeGBZwQ');
    expect(
      primaryVideo({
        resources: [{ type: 'AUDIO', url: 'https://example.com/lecture.ogg' }],
      }),
    ).toBeNull();
    expect(
      primaryVideo({
        resources: [{ type: 'VIDEO', url: 'https://example.com/movie.ogg' }],
      }),
    ).toBe('https://example.com/movie.ogg');
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T15:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());
  it('does not unlock a lesson by seeking directly to the end', async () => {
    const { service } = build();
    await service.recordVideo(7, 1, {
      position: 0,
      duration: 100,
      playing: true,
    });
    vi.advanceTimersByTime(1000);
    expect(
      await service.recordVideo(7, 1, {
        position: 99,
        duration: 100,
        playing: false,
      }),
    ).toMatchObject({ percent: 0, eligible: false });
    await expect(service.assertVideoComplete(7, 1)).rejects.toThrow('90 %');
  });
  it('unlocks at exactly 90 percent of distinct played footage and persists progress', async () => {
    const { service } = build();
    await service.recordVideo(7, 1, {
      position: 0,
      duration: 100,
      playing: true,
    });
    for (let position = 10; position <= 90; position += 10) {
      vi.advanceTimersByTime(5000);
      await service.recordVideo(7, 1, {
        position,
        duration: 100,
        playing: true,
      });
    }
    expect(await service.videoState(7, 1)).toMatchObject({
      percent: 90,
      eligible: true,
    });
    await expect(service.assertVideoComplete(7, 1)).resolves.toBeUndefined();
  });
  it('does not count time spent paused or stale reports', async () => {
    const { service } = build();
    await service.recordVideo(7, 1, {
      position: 0,
      duration: 100,
      playing: false,
    });
    vi.advanceTimersByTime(10000);
    expect(
      await service.recordVideo(7, 1, {
        position: 10,
        duration: 100,
        playing: true,
      }),
    ).toMatchObject({ percent: 0 });
    vi.advanceTimersByTime(30000);
    expect(
      await service.recordVideo(7, 1, {
        position: 40,
        duration: 100,
        playing: true,
      }),
    ).toMatchObject({ percent: 0 });
  });
  it('resets coverage when the teacher replaces the video, but rejects a changed reported duration', async () => {
    const { service, lesson } = build();
    await service.recordVideo(7, 1, {
      position: 0,
      duration: 100,
      playing: true,
    });
    await expect(
      service.recordVideo(7, 1, { position: 0, duration: 1, playing: true }),
    ).rejects.toThrow('duracion');
    lesson.videoUrl = 'https://example.com/new.mp4';
    expect(await service.videoState(7, 1)).toMatchObject({
      percent: 0,
      eligible: false,
    });
  });
  it('blocks direct access to a later lesson until the earlier video lesson is complete', async () => {
    const { service, prisma } = build();
    await expect(service.assertLessonOrder(7, 1, 2)).rejects.toThrow('90 %');
    prisma.lessonProgress.findMany.mockResolvedValue([{ lessonId: 1 }]);
    await expect(service.assertLessonOrder(7, 1, 2)).resolves.toBeUndefined();
  });
  it('allows reviewing a completed lesson even if an earlier video is now incomplete', async () => {
    const { service, prisma } = build();
    prisma.lessonProgress.findMany.mockResolvedValue([{ lessonId: 2 }]);
    await expect(service.assertLessonOrder(7, 1, 2)).resolves.toBeUndefined();
  });
  it('merges overlap and never counts replayed footage twice', () => {
    const ranges = addWatchedRange(
      [
        [0, 30],
        [40, 50],
      ],
      20,
      45,
      100,
    );
    expect(ranges).toEqual([[0, 50]]);
    expect(watchedPercent(addWatchedRange(ranges, 0, 20, 100), 100)).toBe(50);
  });
});

describe('Certificate eligibility', () => {
  function requirements() {
    const ctx = build();
    const modules = [
      {
        id: 1,
        lessons: [{ id: 1, progress: [{ id: 1 }] }],
        evaluations: [
          {
            id: 2,
            title: 'Quiz',
            passingScore: 70,
            attempts: [{ score: 80, passed: true }],
          },
        ],
        assignments: [
          {
            id: 3,
            title: 'Proyecto',
            maxScore: 50,
            submissions: [{ status: 'GRADED', score: 30 }],
          },
        ],
      },
    ];
    ctx.prisma.courseModule.findMany.mockResolvedValue(modules);
    return { ...ctx, modules };
  }
  it('requires the configured quiz grade and at least 60 percent for each task', async () => {
    const { service, modules } = requirements();
    expect(await service.completion(5, 1)).toMatchObject({
      eligible: true,
      average: 70,
    });
    modules[0].assignments[0].submissions[0].score = 29;
    expect(await service.completion(5, 1)).toMatchObject({
      eligible: false,
      gradesComplete: false,
    });
  });
  it('keeps a pending grade, failed quiz or incomplete lesson from issuing a certificate', async () => {
    const { service, modules } = requirements();
    modules[0].assignments[0].submissions[0].status = 'SUBMITTED';
    expect((await service.completion(5, 1)).eligible).toBe(false);
    modules[0].assignments[0].submissions[0].status = 'GRADED';
    modules[0].evaluations[0].attempts[0].passed = false;
    expect((await service.completion(5, 1)).eligible).toBe(false);
    modules[0].evaluations[0].attempts[0].passed = true;
    modules[0].lessons[0].progress = [];
    expect((await service.completion(5, 1)).eligible).toBe(false);
  });
  it('does not graduate an empty course or a cancelled enrollment', async () => {
    const { service, prisma } = requirements();
    prisma.courseModule.findMany.mockResolvedValue([]);
    expect((await service.completion(5, 1)).eligible).toBe(false);
    prisma.enrollment.findUnique.mockResolvedValue({
      id: 7,
      status: 'CANCELLED',
    });
    await expect(service.completion(5, 1)).rejects.toThrow('inscrito');
  });
});
