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
4. **Excepción única:** `course-access` resuelve a qué curso pertenece cualquier entidad (módulo, lección, recurso, evaluación) para decidir permisos. Es de solo lectura.
5. No se permiten dependencias circulares entre módulos.

## Dependencias entre módulos

```
courses ──► categories
        ──► course-modules ─┐
        ──► progress ──► lessons
evaluations ──► progress    │
lessons, resources,         ▼
course-modules, progress, evaluations, courses ──► course-access
todos ──► auth (guards)
```

## Permisos

Centralizados en `course-access/course-access.service.ts`:

- `assertCanManage(user, courseId)`: profesor dueño o administrador.
- `assertCanView(user, courseId)`: cualquiera si el curso está publicado; si no, quien lo gestiona. Un borrador ajeno responde 404, no 403.

## Pruebas

- Los services se prueban con el repositorio simulado (`*.service.spec.ts`), sin base de datos.
- `npm test` ejecuta todo; `npm run lint` usa oxlint con tipos.

## Pendiente

- `users` (módulo de autenticación) todavía usa Prisma directamente desde su service. Falta pasarlo a `users.repository.ts`.
