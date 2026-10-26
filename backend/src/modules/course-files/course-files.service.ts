import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface.js';
import { CourseAccessService } from '../course-access/course-access.service.js';
import { ProgressService } from '../progress/progress.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { CourseFilesRepository } from './course-files.repository.js';

export const MAX_COURSE_FILES = 20;

/** Dónde se descarga (requiere sesión: se pide con `HttpClient` como blob). */
const downloadUrl = (id: number) => `/api/course-files/${id}/download`;

/**
 * Archivos descargables de un curso (guías, plantillas, material complementario). Los adjunta quien
 * gestiona el curso; los descargan ellos y los estudiantes inscritos.
 */
@Injectable()
export class CourseFilesService {
  constructor(
    private readonly repository: CourseFilesRepository,
    private readonly access: CourseAccessService,
    private readonly progress: ProgressService,
    private readonly uploads: UploadsService,
  ) {}

  /** Quien gestiona el curso ve los archivos; un estudiante, solo si está inscrito. */
  async list(user: AuthenticatedUser, courseId: number) {
    await this.assertCanOpen(user, courseId);

    return (await this.repository.list(courseId)).map((file) => this.present(file));
  }

  async attach(user: AuthenticatedUser, courseId: number, storedName: string) {
    await this.access.assertCanManage(user, courseId);

    if ((await this.repository.count(courseId)) >= MAX_COURSE_FILES) {
      throw new BadRequestException(`Un curso puede tener hasta ${MAX_COURSE_FILES} archivos adjuntos`);
    }

    const info = await this.uploads.privateInfo(storedName);

    if (!info || info.uploadedBy !== user.id || !(await this.uploads.resolvePrivate(storedName))) {
      throw new BadRequestException(`El archivo ${storedName} no existe o no lo subiste tú`);
    }

    if (await this.repository.findByStoredName(storedName)) {
      throw new BadRequestException('Ese archivo ya está adjunto a un curso');
    }

    const created = await this.repository.create({
      courseId,
      storedName,
      originalName: info.originalName,
      size: info.size,
      position: await this.repository.count(courseId),
    });

    return this.present(created);
  }

  async remove(user: AuthenticatedUser, courseId: number, fileId: number) {
    await this.access.assertCanManage(user, courseId);

    const file = await this.repository.findById(fileId);

    if (!file || file.courseId !== courseId) {
      throw new NotFoundException('El archivo no existe');
    }

    await this.repository.delete(fileId);
    await this.uploads.removePrivate([file.storedName]);

    return { deleted: true };
  }

  /** Para descargarlo: para cualquiera sin acceso es como si no existiera. */
  async fileForDownload(user: AuthenticatedUser, fileId: number) {
    const file = await this.repository.findById(fileId);

    if (!file) {
      throw new NotFoundException('El archivo no existe');
    }

    try {
      await this.assertCanOpen(user, file.courseId);
    } catch {
      throw new NotFoundException('El archivo no existe');
    }

    const path = await this.uploads.resolvePrivate(file.storedName);

    if (!path) {
      throw new NotFoundException('El archivo no existe');
    }

    return { path, originalName: file.originalName };
  }

  /** Los nombres guardados de los archivos de un curso (para limpiar el disco al borrarlo). */
  async namesOfCourse(courseId: number) {
    return this.repository.namesOfCourse(courseId);
  }

  /** Borra del disco archivos que ya no tienen registro (los registros caen en cascada con el curso). */
  async removeStored(names: string[]) {
    await this.uploads.removePrivate(names);
  }

  private async assertCanOpen(user: AuthenticatedUser, courseId: number) {
    const course = await this.access.assertCanView(user, courseId);

    try {
      await this.access.assertCanManage(user, courseId);

      return course;
    } catch {
      if (!(await this.progress.isEnrolled(user.id, courseId))) {
        throw new ForbiddenException('Debes estar inscrito en el curso para ver sus archivos');
      }

      return course;
    }
  }

  private present(file: { id: number; originalName: string; size: number; position: number; createdAt: Date }) {
    return {
      id: file.id,
      originalName: file.originalName,
      size: file.size,
      createdAt: file.createdAt,
      url: downloadUrl(file.id),
    };
  }
}
