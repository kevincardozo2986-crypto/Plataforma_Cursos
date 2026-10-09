import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Cursos que gestiona un docente: los que creó (`teacherId`) y aquellos donde es instructor.
 * Se usa en todas las consultas de "mis cursos" (bandejas de revisión, anuncios, discusiones,
 * reseñas, dashboard) para que un instructor vea lo mismo que el autor.
 */
export const managedBy = (userId: number) =>
  ({
    OR: [{ teacherId: userId }, { instructors: { some: { userId } } }],
  }) satisfies Prisma.CourseWhereInput;
