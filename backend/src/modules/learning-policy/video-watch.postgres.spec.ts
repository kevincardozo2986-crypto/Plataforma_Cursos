import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';
import { LearningPolicyService } from './learning-policy.service.js';

/** Opt in: exercises the real pg adapter; all fixture data is rolled back. */
describe.runIf(process.env.CAMPUS_POSTGRES_TESTS === '1')(
  'Video progress with PostgreSQL',
  () => {
    it('acquires the advisory lock and saves watched footage without deserializing void', async () => {
      const prisma = new PrismaService();
      const marker = randomUUID();
      const rollback = new Error('rollback regression fixture');
      try {
        await expect(
          prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
              data: {
                firstName: 'Regression',
                lastName: 'Fixture',
                email: marker + '@example.invalid',
                document: marker,
                passwordHash: 'unused-test-fixture',
              },
            });
            const course = await tx.course.create({
              data: {
                title: 'Transactional fixture',
                slug: marker,
                description: '',
                price: 0,
                teacherId: user.id,
              },
            });
            const module = await tx.courseModule.create({
              data: { title: 'Fixture', courseId: course.id },
            });
            const lesson = await tx.lesson.create({
              data: {
                title: 'Video fixture',
                moduleId: module.id,
                videoUrl: 'https://example.invalid/video.mp4',
              },
            });
            const enrollment = await tx.enrollment.create({
              data: { userId: user.id, courseId: course.id },
            });
            // Reuse the outer transaction so the service's writes are rolled back with its fixture.
            const transactional = {
              lesson: tx.lesson,
              videoWatchProgress: tx.videoWatchProgress,
              $transaction: (
                callback: (client: typeof tx) => Promise<unknown>,
              ) => callback(tx),
            } as unknown as PrismaService;
            const service = new LearningPolicyService(transactional);
            expect(
              await service.recordVideo(enrollment.id, lesson.id, {
                position: 0,
                duration: 100,
                playing: true,
              }),
            ).toMatchObject({ percent: 0, eligible: false });
            await tx.videoWatchProgress.update({
              where: {
                enrollmentId_lessonId: {
                  enrollmentId: enrollment.id,
                  lessonId: lesson.id,
                },
              },
              data: { reportedAt: new Date(Date.now() - 5000) },
            });
            expect(
              await service.recordVideo(enrollment.id, lesson.id, {
                position: 5,
                duration: 100,
                playing: true,
              }),
            ).toMatchObject({ percent: 5, eligible: false });
            throw rollback;
          }),
        ).rejects.toBe(rollback);
        expect(
          await prisma.user.findUnique({
            where: { email: marker + '@example.invalid' },
          }),
        ).toBeNull();
      } finally {
        await prisma.$disconnect();
      }
    });
  },
);
