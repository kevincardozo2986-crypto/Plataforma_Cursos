import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { Role } from '../../generated/prisma/enums.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import {
  AssignmentsRepository,
  type SubmissionFile,
} from './assignments.repository.js';
import {
  CreateAssignmentDto,
  GradeSubmissionDto,
  ListSubmissionsQueryDto,
  SubmitAssignmentDto,
  UpdateAssignmentDto,
} from './dto/assignment.dto.js';
import {
  assertCanSubmit,
  assertHasContent,
  assertValidScore,
} from './submission-rules.js';

/** Ruta desde la que se descargan los archivos de una entrega (requiere sesión). */
const fileUrl = (name: string) => `/api/submission-files/${name}`;

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly repository: AssignmentsRepository,
    private readonly access: CourseAccessService,
    private readonly progress: ProgressService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
  ) {}

  async listByModule(user: AuthenticatedUser, moduleId: number) {
    const courseId = await this.access.courseIdOfModule(moduleId);
    await this.access.assertCanView(user, courseId);
    await this.access.assertContentAccess(user, { moduleId });

    const assignments = await this.repository.findByModule(moduleId, user.id);

    return assignments.map(({ submissions, _count, ...assignment }) => ({
      ...assignment,
      submissionCount: _count.submissions,
      mySubmission: submissions[0] ?? null,
    }));
  }

  async findOne(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfAssignment(id);
    await this.access.assertCanView(user, courseId);
    await this.access.assertContentAccess(user, { assignmentId: id });

    return this.getOrThrow(id);
  }

  async create(
    user: AuthenticatedUser,
    moduleId: number,
    dto: CreateAssignmentDto,
  ) {
    const courseId = await this.access.courseIdOfModule(moduleId);
    await this.access.assertCanManage(user, courseId);

    return this.repository.create({
      moduleId,
      title: dto.title,
      description: dto.description,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      allowLate: dto.allowLate,
      maxScore: dto.maxScore,
    });
  }

  async update(user: AuthenticatedUser, id: number, dto: UpdateAssignmentDto) {
    const courseId = await this.access.courseIdOfAssignment(id);
    await this.access.assertCanManage(user, courseId);

    if (
      dto.maxScore !== undefined &&
      dto.maxScore < (await this.repository.highestScore(id))
    ) {
      throw new BadRequestException(
        'No puedes bajar el puntaje máximo por debajo de una nota ya puesta',
      );
    }

    return this.repository.update(id, {
      title: dto.title,
      description: dto.description,
      dueAt:
        dto.dueAt === undefined
          ? undefined
          : dto.dueAt === null
            ? null
            : new Date(dto.dueAt),
      allowLate: dto.allowLate,
      maxScore: dto.maxScore,
    });
  }

  async remove(user: AuthenticatedUser, id: number) {
    const courseId = await this.access.courseIdOfAssignment(id);
    await this.access.assertCanManage(user, courseId);

    const names = await this.repository.fileNamesOfAssignment(id);

    await this.repository.delete(id);
    await this.uploads.removePrivate(names);

    return { deleted: true };
  }

  // --- Estudiante ---

  /** Entrega (o reenvía, mientras no esté calificada) una tarea. */
  async submit(
    user: AuthenticatedUser,
    assignmentId: number,
    dto: SubmitAssignmentDto,
    now = new Date(),
  ) {
    const courseId = await this.access.courseIdOfAssignment(assignmentId);
    await this.access.assertCanView(user, courseId);
    await this.access.assertContentAccess(user, { assignmentId });

    if (!(await this.progress.isEnrolled(user.id, courseId))) {
      throw new ForbiddenException(
        'Debes estar inscrito en el curso para entregar la tarea',
      );
    }

    const assignment = await this.getOrThrow(assignmentId);
    const current = await this.repository.findSubmission(assignmentId, user.id);

    const late = assertCanSubmit(
      assignment,
      current?.status,
      now,
    );
    const files = await this.resolveFiles(user, assignmentId, dto);

    assertHasContent(dto.text, files.length);

    const saved = await this.repository.saveSubmission({
      assignmentId,
      userId: user.id,
      text: dto.text?.trim() || null,
      files,
      late,
    });

    // Los archivos de la entrega anterior que ya no se usan se borran del servidor.
    const kept = new Set(files.map((file) => file.name));
    await this.uploads.removePrivate(
      this.repository.namesOf(current?.files).filter((name) => !kept.has(name)),
    );

    return this.toStudentSubmission(saved);
  }

  async mySubmission(user: AuthenticatedUser, assignmentId: number) {
    const courseId = await this.access.courseIdOfAssignment(assignmentId);
    await this.access.assertCanView(user, courseId);

    const submission = await this.repository.findSubmission(
      assignmentId,
      user.id,
    );

    if (!submission) {
      throw new NotFoundException('Todavía no has entregado esta tarea');
    }

    return this.toStudentSubmission(submission);
  }

  // --- Docente: revisión ---

  /** Bandeja del docente: entregas de sus cursos (o de todos, si es admin). */
  async listSubmissions(
    user: AuthenticatedUser,
    query: ListSubmissionsQueryDto,
  ) {
    if (query.courseId !== undefined) {
      await this.access.assertCanManage(user, query.courseId);
    }

    const { items, total } = await this.repository.findForReview({
      teacherId: user.role === Role.ADMIN ? undefined : user.id,
      courseId: query.courseId,
      assignmentId: query.assignmentId,
      status: query.status,
      take: query.limit ?? 20,
      skip: query.offset ?? 0,
    });

    return {
      total,
      items: items.map((item) => ({
        id: item.id,
        status: item.status,
        late: item.late,
        score: item.score,
        maxScore: item.assignment.maxScore,
        submittedAt: item.submittedAt,
        gradedAt: item.gradedAt,
        student: item.user,
        assignment: { id: item.assignment.id, title: item.assignment.title },
        course: item.assignment.module.course,
      })),
    };
  }

  async getSubmission(user: AuthenticatedUser, id: number) {
    const detail = await this.findManaged(user, id);

    return this.toTeacherSubmission(detail);
  }

  async gradeSubmission(
    user: AuthenticatedUser,
    id: number,
    dto: GradeSubmissionDto,
  ) {
    const detail = await this.findManaged(user, id);

    assertValidScore(dto.score, detail.assignment.maxScore);

    await this.repository.saveGrade(id, {
      score: dto.score,
      feedback: dto.feedback,
      gradedById: user.id,
    });

    // El estudiante se entera de su nota (también si el docente la corrige después).
    await this.notifications.notify([detail.user.id], {
      type: 'GRADED_ASSIGNMENT',
      title: `Calificaron tu tarea: ${dto.score} de ${detail.assignment.maxScore}`,
      message: `«${detail.assignment.title}» en «${detail.assignment.module.course.title}»`,
      courseId: detail.assignment.module.courseId,
      refId: detail.assignment.id,
    });

    return this.getSubmission(user, id);
  }

  // --- Archivos privados ---

  /**
   * Un archivo de una entrega solo lo descarga quien lo entregó o el docente del curso.
   * Para cualquier otro es como si no existiera.
   */
  async fileForDownload(user: AuthenticatedUser, name: string) {
    const submission = await this.repository.findByFileName(name);

    if (!submission) {
      throw new NotFoundException('El archivo no existe');
    }

    if (submission.userId !== user.id) {
      try {
        await this.access.assertCanManage(
          user,
          submission.assignment.module.courseId,
        );
      } catch {
        throw new NotFoundException('El archivo no existe');
      }
    }

    const path = await this.uploads.resolvePrivate(name);
    const entry = this.filesOf(submission.files).find((f) => f.name === name);

    if (!path || !entry) {
      throw new NotFoundException('El archivo no existe');
    }

    return { path, originalName: entry.originalName };
  }

  // --- Internos ---

  private async getOrThrow(id: number) {
    const assignment = await this.repository.findById(id);

    if (!assignment) {
      throw new NotFoundException('La tarea no existe');
    }

    return assignment;
  }

  private async findManaged(user: AuthenticatedUser, id: number) {
    const detail = await this.repository.findDetail(id);

    if (!detail) {
      throw new NotFoundException('La entrega no existe');
    }

    await this.access.assertCanManage(user, detail.assignment.module.courseId);

    return detail;
  }

  /**
   * Cada archivo adjunto debe existir, haberlo subido quien entrega y no estar ya en
   * otra entrega (así, borrar una entrega no deja rota otra).
   */
  private async resolveFiles(
    user: AuthenticatedUser,
    assignmentId: number,
    dto: SubmitAssignmentDto,
  ): Promise<SubmissionFile[]> {
    const names = [...new Set((dto.files ?? []).map((file) => file.name))];
    const files: SubmissionFile[] = [];

    for (const name of names) {
      const info = await this.uploads.privateInfo(name);

      if (
        !info ||
        info.uploadedBy !== user.id ||
        !(await this.uploads.resolvePrivate(name))
      ) {
        throw new BadRequestException(
          `El archivo ${name} no existe o no lo subiste tú`,
        );
      }

      const used = await this.repository.findByFileName(name);

      if (
        used &&
        !(used.assignmentId === assignmentId && used.userId === user.id)
      ) {
        throw new BadRequestException(
          `El archivo ${name} ya se usó en otra entrega`,
        );
      }

      files.push({ name, originalName: info.originalName, size: info.size });
    }

    return files;
  }

  private filesOf(files: unknown): SubmissionFile[] {
    return Array.isArray(files) ? (files as SubmissionFile[]) : [];
  }

  private withUrls(files: unknown) {
    return this.filesOf(files).map((file) => ({ ...file, url: fileUrl(file.name) }));
  }

  /** Lo que ve el estudiante de su entrega. */
  private toStudentSubmission(submission: {
    id: number;
    assignmentId: number;
    status: string;
    late: boolean;
    text: string | null;
    files: unknown;
    score: number | null;
    feedback: string | null;
    submittedAt: Date;
    gradedAt: Date | null;
  }) {
    return {
      id: submission.id,
      assignmentId: submission.assignmentId,
      status: submission.status,
      late: submission.late,
      text: submission.text,
      files: this.withUrls(submission.files),
      score: submission.score,
      feedback: submission.feedback,
      submittedAt: submission.submittedAt,
      gradedAt: submission.gradedAt,
    };
  }

  private toTeacherSubmission(
    detail: NonNullable<
      Awaited<ReturnType<AssignmentsRepository['findDetail']>>
    >,
  ) {
    return {
      id: detail.id,
      status: detail.status,
      late: detail.late,
      text: detail.text,
      files: this.withUrls(detail.files),
      score: detail.score,
      maxScore: detail.assignment.maxScore,
      feedback: detail.feedback,
      submittedAt: detail.submittedAt,
      gradedAt: detail.gradedAt,
      student: detail.user,
      assignment: {
        id: detail.assignment.id,
        title: detail.assignment.title,
        dueAt: detail.assignment.dueAt,
        maxScore: detail.assignment.maxScore,
      },
      course: {
        id: detail.assignment.module.courseId,
        title: detail.assignment.module.course.title,
      },
    };
  }
}
