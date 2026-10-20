import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service.js';

const INACTIVE_MS = 7 * 24 * 60 * 60 * 1000;
@Injectable()
export class ActivityNotificationsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ActivityNotificationsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private startup?: ReturnType<typeof setTimeout>;
  private scanning = false;
  constructor(private readonly prisma: PrismaService) {}
  onApplicationBootstrap(): void {
    this.startup = setTimeout(() => {
      void this.remindInactive();
    }, 1000);
    this.startup.unref();
    this.timer = setInterval(
      () => {
        void this.remindInactive();
      },
      60 * 60 * 1000,
    );
    this.timer.unref();
  }
  onModuleDestroy(): void {
    clearTimeout(this.startup);
    clearInterval(this.timer);
  }
  async passwordChanged(userId: number): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId,
          type: 'PASSWORD_CHANGED',
          eventKey: `password:${userId}:${randomUUID()}`,
          title: 'Tu contraseña fue actualizada',
          message:
            'Se cambió la contraseña de tu cuenta. Si no fuiste tú, recupera tu acceso y contacta al administrador.',
        },
      });
    } catch {
      this.logger.error('No se pudo guardar el aviso de cambio de contrasena.');
    }
  }
  async coursePublished(courseId: number): Promise<void> {
    try {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, title: true, status: true, visibility: true },
      });
      if (
        !course ||
        course.status !== 'PUBLISHED' ||
        course.visibility !== 'PUBLIC'
      )
        return;
      let cursor = 0;
      while (true) {
        const students = await this.prisma.user.findMany({
          where: { id: { gt: cursor }, role: 'STUDENT', status: 'ACTIVE' },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: 500,
        });
        if (!students.length) break;
        await this.prisma.notification.createMany({
          skipDuplicates: true,
          data: students.map((student) => ({
            userId: student.id,
            courseId,
            type: 'NEW_COURSE' as const,
            eventKey: `new-course:${courseId}:${student.id}`,
            title: 'Un nuevo curso para ti',
            message: `Ya puedes explorar «${course.title}». Descubre lo que puedes aprender.`,
          })),
        });
        cursor = students[students.length - 1].id;
      }
    } catch {
      this.logger.error('No se pudieron guardar los avisos del nuevo curso.');
    }
  }
  async remindInactive(now = new Date()): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const cutoff = new Date(now.getTime() - INACTIVE_MS);
      let cursor = 0;
      while (true) {
        const enrollments = await this.prisma.enrollment.findMany({
          where: {
            id: { gt: cursor },
            status: 'ACTIVE',
            enrolledAt: { lte: cutoff },
            user: { role: 'STUDENT', status: 'ACTIVE' },
            course: {
              status: 'PUBLISHED',
              modules: { some: { lessons: { some: {} } } },
            },
            lessonProgress: { none: { completedAt: { gt: cutoff } } },
          },
          select: {
            id: true,
            userId: true,
            courseId: true,
            enrolledAt: true,
            course: { select: { title: true } },
            lessonProgress: {
              select: { completedAt: true },
              orderBy: { completedAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { id: 'asc' },
          take: 250,
        });
        if (!enrollments.length) break;
        await this.prisma.notification.createMany({
          skipDuplicates: true,
          data: enrollments.map((item) => {
            const lastActivity =
              item.lessonProgress[0]?.completedAt ?? item.enrolledAt;
            return {
              userId: item.userId,
              courseId: item.courseId,
              type: 'COURSE_REMINDER' as const,
              eventKey: `reminder:${item.id}:${lastActivity.toISOString()}`,
              title: 'Tu curso te está esperando',
              message: `Llevas al menos 7 días sin avanzar en «${item.course.title}». Retoma una lección a tu ritmo.`,
            };
          }),
        });
        cursor = enrollments[enrollments.length - 1].id;
      }
    } catch {
      this.logger.error('No se pudieron generar los recordatorios de cursos.');
    } finally {
      this.scanning = false;
    }
  }
}
