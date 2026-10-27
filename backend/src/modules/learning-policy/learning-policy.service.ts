import { localVideoDuration } from './local-video-duration.js';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  addWatchedRange,
  primaryVideo,
  watchedPercent,
  type WatchedRange,
} from './watch-coverage.js';

@Injectable()
export class LearningPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  private async orderedLessons(courseId: number) {
    return this.prisma.lesson.findMany({
      where: { module: { courseId } },
      orderBy: [
        { module: { position: 'asc' } },
        { moduleId: 'asc' },
        { position: 'asc' },
        { id: 'asc' },
      ],
      include: { resources: { orderBy: { id: 'asc' } } },
    });
  }

  async assertLessonOrder(
    enrollmentId: number,
    courseId: number,
    lessonId: number,
  ) {
    const lessons = await this.orderedLessons(courseId);
    const index = lessons.findIndex((l) => l.id === lessonId);
    if (index < 0)
      throw new ForbiddenException('La leccion no pertenece al curso');
    const done = await this.prisma.lessonProgress.findMany({
      where: { enrollmentId },
      select: { lessonId: true },
    });
    const completed = new Set(done.map((l) => l.lessonId));
    if (completed.has(lessonId)) return;
    const previous = lessons
      .slice(0, index)
      .find((l) => primaryVideo(l) && !completed.has(l.id));
    if (previous)
      throw new ForbiddenException(
        'Mira al menos el 90 % del video anterior y completa esa leccion para continuar',
      );
  }

  async videoState(enrollmentId: number, lessonId: number) {
    const lesson = await this.prisma.lesson.findUniqueOrThrow({
      where: { id: lessonId },
      include: { resources: { orderBy: { id: 'asc' } } },
    });
    const source = primaryVideo(lesson);
    const row = await this.prisma.videoWatchProgress.findUnique({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    const valid = row && row.source === source;
    const percent = valid
      ? watchedPercent(row.ranges as WatchedRange[], row.duration)
      : 0;
    return {
      required: Boolean(source),
      percent: Math.floor(percent),
      eligible: !source || percent >= 90,
      position: valid ? row.position : 0,
    };
  }

  async assertVideoComplete(enrollmentId: number, lessonId: number) {
    const state = await this.videoState(enrollmentId, lessonId);
    if (!state.eligible)
      throw new ForbiddenException(
        'Debes ver al menos el 90 % del video para completar esta leccion',
      );
  }

  async recordVideo(
    enrollmentId: number,
    lessonId: number,
    data: { position: number; duration: number; playing: boolean },
  ) {
    const lesson = await this.prisma.lesson.findUniqueOrThrow({
      where: { id: lessonId },
      include: { resources: { orderBy: { id: 'asc' } } },
    });
    const source = primaryVideo(lesson);
    if (!source) throw new BadRequestException('Esta leccion no tiene video');
    if (data.position > data.duration + 1)
      throw new BadRequestException('Posicion de video invalida');
    const authoritativeDuration = await localVideoDuration(source);
    if (
      authoritativeDuration &&
      Math.abs(data.duration - authoritativeDuration) > 1
    )
      throw new BadRequestException(
        'La duracion del video no coincide con el archivo',
      );
    await this.prisma.$transaction(async (tx) => {
      // Serialize reports from multiple tabs before reading/merging watched segments.
      // The lock function returns void, which Prisma's pg adapter cannot deserialize.
      // Execute it in FROM and expose only a supported integer column to Prisma.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${enrollmentId}::int, ${lessonId}::int)`;
      const previous = await tx.videoWatchProgress.findUnique({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      });
      const valid = previous && previous.source === source;
      if (valid && Math.abs(previous.duration - data.duration) > 1)
        throw new BadRequestException(
          'La duracion del video cambio; recarga la leccion',
        );
      const duration =
        authoritativeDuration ?? (valid ? previous.duration : data.duration);
      const now = new Date();
      let ranges: WatchedRange[] = valid
        ? (previous.ranges as WatchedRange[])
        : [];
      const delta = valid ? data.position - previous.position : 0;
      const elapsed = valid
        ? (now.getTime() - previous.reportedAt.getTime()) / 1000
        : 0;
      // A seek or a stale heartbeat never counts as watched footage. Playback up to 2x is allowed.
      if (
        valid &&
        previous.playing &&
        delta > 0 &&
        elapsed <= 20 &&
        delta <= elapsed * 2.1 + 0.5
      ) {
        ranges = addWatchedRange(
          ranges,
          previous.position,
          data.position,
          duration,
        );
      }
      const update = {
        source,
        duration,
        position: data.position,
        playing: data.playing,
        reportedAt: now,
        ranges,
      };
      await tx.videoWatchProgress.upsert({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
        create: { enrollmentId, lessonId, ...update },
        update,
      });
    });
    return this.videoState(enrollmentId, lessonId);
  }

  async completion(userId: number, courseId: number) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment || enrollment.status === 'CANCELLED')
      throw new ForbiddenException('Debes estar inscrito en este curso');
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      include: {
        lessons: {
          select: {
            id: true,
            progress: {
              where: { enrollmentId: enrollment.id },
              select: { id: true },
            },
          },
        },
        evaluations: {
          include: {
            attempts: {
              where: { userId, status: 'GRADED' },
              orderBy: { score: 'desc' },
            },
          },
        },
        assignments: { include: { submissions: { where: { userId } } } },
      },
    });
    const lessons = modules.flatMap((m) => m.lessons);
    const evaluations = modules.flatMap((m) =>
      m.evaluations.map((e) => ({
        id: e.id,
        moduleId: m.id,
        title: e.title,
        type: 'evaluation' as const,
        minimum: e.passingScore,
        score: e.attempts[0]?.score ?? null,
        passed: e.attempts.some((a) => a.passed && a.score >= e.passingScore),
      })),
    );
    const assignments = modules.flatMap((m) =>
      m.assignments.map((a) => {
        const submission = a.submissions[0];
        const score =
          submission?.status === 'GRADED' && submission.score !== null
            ? (submission.score / a.maxScore) * 100
            : null;
        return {
          id: a.id,
          moduleId: m.id,
          title: a.title,
          type: 'assignment' as const,
          minimum: 60,
          score: score === null ? null : Math.round(score * 100) / 100,
          passed: score !== null && score >= 60,
        };
      }),
    );
    const assessments = [...evaluations, ...assignments];
    const contentComplete =
      lessons.length > 0 && lessons.every((l) => l.progress.length > 0);
    const gradesComplete = assessments.every((a) => a.passed);
    const scores = assessments.flatMap((a) =>
      a.score === null ? [] : [a.score],
    );
    await this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      select: { certificateTemplateId: true },
    });
    return {
      contentComplete,
      gradesComplete,
      eligible: contentComplete && gradesComplete,
      certificateEnabled: true,
      assessments,
      average: scores.length
        ? Math.round(
            (scores.reduce((sum, score) => sum + score, 0) / scores.length) *
              100,
          ) / 100
        : null,
    };
  }
}
