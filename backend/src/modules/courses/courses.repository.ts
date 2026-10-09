import { Injectable } from '@nestjs/common';

import { managedBy } from '../../common/prisma/managed-by.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CourseLevel,
  CourseStatus,
  CourseVisibility,
  DripType,
} from '../../generated/prisma/enums.js';

const teacherSelect = { id: true, firstName: true, lastName: true } as const;
/** Datos de una persona del equipo de un curso (autor o instructor), para quien lo gestiona. */
const memberSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

const listInclude = {
  category: true,
  teacher: { select: teacherSelect },
  // Para mostrar "N módulos" en las tarjetas del catálogo.
  _count: { select: { modules: true } },
} as const;

/** Nunca se devuelve el hash de la contraseña de acceso en listados ni en el catálogo. */
const withoutSecrets = { accessPassword: true } as const;

/** Los cursos privados no salen en el catálogo. */
const publicWhere = {
  status: CourseStatus.PUBLISHED,
  visibility: { not: CourseVisibility.PRIVATE },
} as const;

export interface PublishedFilter {
  categoryId?: number;
  level?: CourseLevel;
  search?: string;
}

/** Valores que se pueden escribir en un curso. null borra los campos opcionales. */
export interface CourseData {
  title?: string;
  slug?: string;
  description?: string;
  imageUrl?: string | null;
  introVideoUrl?: string | null;
  price?: number;
  level?: CourseLevel;
  categoryId?: number | null;
  visibility?: CourseVisibility;
  accessPassword?: string | null;
  maxStudents?: number | null;
  publicContent?: boolean;
  qaEnabled?: boolean;
  dripType?: DripType;
  certificateTemplateId?: number | null;
  whatYouWillLearn?: string | null;
  audience?: string | null;
  durationMinutes?: number | null;
  materials?: string | null;
  requirements?: string | null;
}

const withPrerequisites = {
  requires: {
    include: { prerequisite: { select: { id: true, title: true } } },
  },
  // La plantilla de certificado asignada, para mostrarla en el editor.
  certificateTemplate: { select: { id: true, name: true } },
} as const;

@Injectable()
export class CoursesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(filter: PublishedFilter, skip: number, take: number) {
    const where = {
      ...publicWhere,
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.level ? { level: filter.level } : {}),
      ...(filter.search
        ? {
            OR: [
              {
                title: { contains: filter.search, mode: 'insensitive' as const },
              },
              {
                description: {
                  contains: filter.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        include: listInclude,
        omit: withoutSecrets,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.course.count({ where }),
    ]);

    return { data, total };
  }

  findPublishedById(id: number) {
    return this.prisma.course.findFirst({
      where: { id, ...publicWhere },
      include: {
        ...listInclude,
        // Los instructores se muestran junto al autor (solo nombres, sin correo).
        instructors: {
          orderBy: { addedAt: 'asc' },
          select: { user: { select: teacherSelect } },
        },
      },
      omit: withoutSecrets,
    });
  }

  /** Autor e instructores de un curso, con sus datos básicos. */
  async findTeam(courseId: number) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        teacher: { select: memberSelect },
        instructors: {
          orderBy: { addedAt: 'asc' },
          select: { addedAt: true, user: { select: memberSelect } },
        },
      },
    });

    return course
      ? {
          owner: course.teacher,
          instructors: course.instructors.map(({ addedAt, user }) => ({
            ...user,
            addedAt,
          })),
        }
      : null;
  }

  addInstructor(courseId: number, userId: number) {
    return this.prisma.courseInstructor.create({ data: { courseId, userId } });
  }

  async removeInstructor(courseId: number, userId: number): Promise<number> {
    const result = await this.prisma.courseInstructor.deleteMany({
      where: { courseId, userId },
    });

    return result.count;
  }

  /** `teacherId` undefined = todos los cursos (admin). */
  listManaged(teacherId?: number) {
    return this.prisma.course.findMany({
      where: teacherId === undefined ? {} : managedBy(teacherId),
      include: listInclude,
      omit: withoutSecrets,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Para el editor: incluye prerrequisitos y el hash (el servicio lo reduce a `hasPassword`). */
  findById(id: number) {
    return this.prisma.course.findUnique({
      where: { id },
      include: { ...listInclude, ...withPrerequisites },
    });
  }

  async slugOwner(slug: string): Promise<number | null> {
    const found = await this.prisma.course.findUnique({
      where: { slug },
      select: { id: true },
    });

    return found?.id ?? null;
  }

  async slugExists(slug: string): Promise<boolean> {
    return (await this.slugOwner(slug)) !== null;
  }

  async countByIds(ids: number[]): Promise<number> {
    return this.prisma.course.count({ where: { id: { in: ids } } });
  }

  create(
    data: CourseData & {
      title: string;
      description: string;
      price: number;
      slug: string;
      teacherId: number;
    },
  ) {
    return this.prisma.course.create({ data, omit: withoutSecrets });
  }

  /**
   * Un borrador del docente al que nadie ha tocado: con el título de borrador, sin
   * descripción, módulos, medios, inscripciones ni ajustes cambiados. Sirve para no
   * acumular borradores vacíos cada vez que se abre el asistente.
   */
  findUntouchedDraft(teacherId: number, draftTitle: string) {
    return this.prisma.course.findFirst({
      where: {
        teacherId,
        status: 'DRAFT',
        title: draftTitle,
        description: '',
        price: 0,
        visibility: 'PUBLIC',
        accessPassword: null,
        maxStudents: null,
        imageUrl: null,
        introVideoUrl: null,
        categoryId: null,
        whatYouWillLearn: null,
        audience: null,
        materials: null,
        requirements: null,
        durationMinutes: null,
        modules: { none: {} },
        enrollments: { none: {} },
        requires: { none: {} },
      },
      orderBy: { id: 'desc' },
      omit: withoutSecrets,
    });
  }

  /** Si `prerequisiteIds` viene, reemplaza la lista completa de prerrequisitos. */
  update(id: number, data: CourseData, prerequisiteIds?: number[]) {
    return this.prisma.$transaction(async (tx) => {
      if (prerequisiteIds) {
        await tx.coursePrerequisite.deleteMany({ where: { courseId: id } });

        if (prerequisiteIds.length > 0) {
          await tx.coursePrerequisite.createMany({
            data: prerequisiteIds.map((prerequisiteId) => ({
              courseId: id,
              prerequisiteId,
            })),
          });
        }
      }

      return tx.course.update({
        where: { id },
        data,
        include: { ...listInclude, ...withPrerequisites },
      });
    });
  }

  updateStatus(id: number, status: CourseStatus) {
    return this.prisma.course.update({
      where: { id },
      data: { status },
      omit: withoutSecrets,
    });
  }

  delete(id: number) {
    return this.prisma.course.delete({ where: { id } });
  }
}
