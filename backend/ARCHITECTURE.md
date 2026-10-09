# Arquitectura del backend

Monolito modular con NestJS, Prisma y PostgreSQL. Cada funcionalidad es un módulo en `src/modules/` con la misma estructura de capas.

## Capas de un módulo

```
Controller  →  Service  →  Repository  →  PrismaService  →  PostgreSQL
```

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Controller | `*.controller.ts` | Rutas HTTP, guards (`JwtAuthGuard`, `RolesGuard`) y DTOs de entrada. Sin lógica. |
| Service | `*.service.ts` | Reglas de negocio y permisos. **No importa Prisma.** |
| Repository | `*.repository.ts` | Único lugar con consultas Prisma del módulo. Sin reglas de negocio. |
| DTO | `dto/*.dto.ts` | Validación del cuerpo con `class-validator`. |

La lógica pura que se puede aislar vive en funciones sin dependencias (por ejemplo `evaluations/scoring.ts`), para probarla sin base de datos.

## Reglas entre módulos

1. **Un repositorio solo escribe en las tablas de su módulo.**
2. **Si un módulo necesita algo de otro, lo pide al service exportado de ese módulo**, nunca a su repositorio ni a sus tablas.
   Ejemplos: `courses` pregunta `CategoriesService.exists()`, `CourseModulesService.countByCourse()` y `ProgressService.countEnrollments()`.
3. Las lecturas pueden seguir relaciones declaradas hacia abajo en el árbol de contenido (módulo → lecciones, lección → recursos, evaluación → preguntas → opciones).
4. **Excepción única:** `course-access` resuelve a qué curso pertenece cualquier entidad (módulo, lección, recurso, evaluación, tarea) para decidir permisos. Es de solo lectura.
5. No se permiten dependencias circulares entre módulos.
6. **Lectura agregada (`dashboard`):** los módulos de reportes y métricas pueden leer, solo para consultar, las tablas de varios módulos (cursos, inscripciones, evaluaciones) con agregados que no tiene sentido pedir uno por uno a cada service. Nunca escriben, y sus consultas viven en su propio repositorio. Cualquier módulo nuevo de este tipo (analíticas, exportaciones) sigue la misma regla.

## Dependencias entre módulos

```
courses ──► categories
        ──► course-modules ─┐
        ──► progress ──► lessons
evaluations ──► progress    │
lessons, resources,         ▼
course-modules, progress, evaluations, courses ──► course-access
assignments ──► progress, uploads   (inscripción; documentos privados de las entregas)
announcements, discussions, reviews ──► progress, notifications   (inscritos; avisos)
notifications ◄── cualquier módulo que necesite avisar a un usuario (NotificationsService.notify)
dashboard ──► course-access   (lee cursos, inscripciones y evaluaciones; solo lectura)
todos ──► auth (guards)
```

## Acceso al contenido

Además de "quién gestiona un curso", `course-access` decide **quién puede abrir su contenido**
(`assertContentAccess`): el docente y los admin siempre; un estudiante inscrito salvo que el módulo siga cerrado por la
liberación gradual (`drip.ts`, lógica pura); y sin inscripción solo si el curso es de contenido público y no usa liberación
gradual. Lecciones, recursos, evaluaciones, tareas y progreso lo llaman antes de entregar contenido. Detalles en `API-CONTENIDO.md`.

## Permisos

Centralizados en `course-access/course-access.service.ts`:

- `assertCanManage(user, courseId)`: profesor dueño o administrador.
- `assertCanView(user, courseId)`: cualquiera si el curso está publicado; si no, quien lo gestiona. Un borrador ajeno responde 404, no 403.

## Pruebas

- Los services se prueban con el repositorio simulado (`*.service.spec.ts`), sin base de datos.
- `npm test` ejecuta todo; `npm run lint` usa oxlint con tipos.

## Pendiente

- `users` (módulo de autenticación) todavía usa Prisma directamente desde su service. Falta pasarlo a `users.repository.ts`.
