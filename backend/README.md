# Backend — Campus Virtual

API REST en **NestJS 12** con **Prisma 7** y **PostgreSQL**. Es un monolito modular: cada funcionalidad es un módulo en `src/modules/`. Para la visión general y la puesta en marcha de todo el proyecto, lee primero el [README de la raíz](../README.md).

## Comandos

Desde `backend/`:

```bash
npm ci                          # instalar dependencias
npx prisma migrate deploy       # crear/actualizar las tablas (hazlo tras cada git pull)
npm run start:dev               # desarrollo con recarga (http://localhost:3000)
npm run build                   # compilar a dist/
npm run start:prod              # ejecutar lo compilado
npm run lint                    # oxlint
npm test                        # pruebas unitarias (vitest)
npm run test:e2e                # pruebas de integración HTTP
npm run format                  # prettier
```

El cliente de Prisma se genera solo antes de `build` y `start:dev` (queda en `src/generated/prisma`, que no se versiona). Si cambias `schema.prisma`, ejecuta `npm run prisma:generate`.

## Configuración

Copia `.env.example` a `.env` y complétalo. **Obligatorias**: `DATABASE_URL` y `JWT_SECRET` (la API no arranca sin `JWT_SECRET`). Todas las variables están explicadas en `.env.example` y en la [tabla del README raíz](../README.md#3-variables-de-entorno-backendenv). Ejecuta siempre los comandos desde `backend/` porque `.env` se lee del directorio de ejecución.

Para ejecutar lo compilado: `node --env-file=.env dist/main.js`.

> CORS permite solo `http://localhost:4200` (está fijo en `src/main.ts`). Al desplegar, cámbialo por la URL real del frontend.

## Estructura

```
backend/
├── prisma/
│   ├── schema.prisma        modelo de datos (fuente de verdad)
│   └── migrations/          historial de cambios de la base de datos
├── src/
│   ├── main.ts              arranque: CORS, ValidationPipe global (whitelist + forbidNonWhitelisted)
│   ├── app.module.ts        registra todos los módulos
│   ├── common/              decoradores (@CurrentUser), DTOs/utilidades compartidas, helper managedBy()
│   ├── database/            PrismaService
│   └── modules/             un directorio por funcionalidad (ver abajo)
├── test/                    pruebas de integración HTTP
├── assets/                  fuentes de los certificados
├── uploads/                 archivos subidos (no se versiona; es el almacenamiento real)
├── postman/                 colección para probar la API
├── API-*.md                 documentación de endpoints por tema
└── ARCHITECTURE.md          reglas de capas y dependencias
```

### Capas de un módulo

```
Controller → Service → Repository → PrismaService → PostgreSQL
```

- **Controller** (`*.controller.ts`): rutas, guards y DTOs. Sin lógica.
- **Service** (`*.service.ts`): reglas de negocio y permisos. No importa Prisma.
- **Repository** (`*.repository.ts`): el único lugar con consultas Prisma del módulo.
- **DTO** (`dto/*.dto.ts`): validación del cuerpo con `class-validator`. Un campo no declarado en el DTO se rechaza con 400.
- Si un módulo necesita algo de otro, llama al **service exportado** del otro módulo, nunca a su repositorio. Sin dependencias circulares. Detalle y excepciones en [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Módulos

| Módulo | Qué hace | Documentación |
| --- | --- | --- |
| `auth` | Registro, login (JWT), recuperación de contraseña por código de correo, guards de sesión y rol. | — |
| `users` | Cuentas y roles. | — |
| `admin` | Panel del administrador: resumen, usuarios, cursos. Solo `ADMIN`. | `API-ADMIN.md` |
| `profile` | Perfil, foto, firma del docente, preferencias y accesibilidad. | `API-PERFIL.md` |
| `categories` | Categorías de cursos. | — |
| `courses` | CRUD de cursos, estados (borrador/publicado/archivado), visibilidad, precio, cupo, prerrequisitos. | `API-INSTRUCTORES.md` |
| `course-modules`, `lessons`, `resources` | Módulos, lecciones y recursos del contenido. | `API-CONTENIDO.md` |
| `course-files` | Archivos descargables del curso (privados). | `API-CONTENIDO.md` §4 |
| `course-access` | **Permisos centralizados**: quién gestiona un curso, quién ve su contenido, liberación gradual (*drip*). | `API-CONTENIDO.md` |
| `progress` | Inscripciones, progreso por lección, seguimiento de video, finalización. | — |
| `evaluations` | Quizzes, intentos y calificación. | `API-EVALUACIONES.md` |
| `assignments` | Tareas, entregas de archivos y calificación. | `API-TAREAS.md` |
| `certificates`, `certificate-fonts` | Plantillas, emisión, PDF (pdfkit) y verificación pública. | `API-CERTIFICADOS.md` |
| `payments` | Compra de cursos con tarjeta **simulada**. | `API-PAGOS.md` |
| `announcements`, `discussions`, `reviews`, `notifications` | Comunicación: anuncios, preguntas/respuestas, reseñas y avisos. | `API-COMUNICACION.md` |
| `dashboard` | Reportes del docente: totales, series, estudiantes, reseñas (solo lectura). | `API-DASHBOARD.md` |
| `uploads` | Subida de imágenes, videos y documentos privados. | — |
| `learning-policy` | Reglas del seguimiento de video: cobertura de tramos vistos (`watch-coverage.ts`) y duración de los MP4 locales. | — |

## Cosas importantes que conviene saber

### Autenticación y permisos
- `POST /auth/login` recibe `identifier` (correo o documento) y `password` y devuelve un JWT. El registro público siempre crea `STUDENT`; solo un administrador crea docentes o administradores.
- `JwtAuthGuard` **relee el rol y el estado del usuario en la base de datos en cada petición**. Desactivar a alguien o cambiar su contraseña incrementa `sessionVersion` e invalida sus tokens.
- Para limitar por rol usa `@UseGuards(JwtAuthGuard, RolesGuard)` con `@Roles(Role.ADMIN)`, etc.
- Para "mis cursos" usa siempre el helper `managedBy(userId)` (`common/prisma/managed-by.ts`) en lugar de filtrar por `teacherId`, así los instructores ven lo mismo que el autor.

### Inscripción y progreso
- `ProgressService.enroll` valida: curso publicado, no inscrito, contraseña (si la hay), cupo, prerrequisitos y **pago aprobado si el curso tiene precio** (si no, responde 402).
- Una lección con video solo se completa con ≥ 90 % de tramos distintos vistos (se guarda en `VideoWatchProgress`). No es una protección DRM frente a un cliente manipulado.
- El certificado exige: lecciones completas, cada evaluación aprobada con su nota mínima y al menos 60 % en cada tarea. Se recalcula cuando se guarda una calificación.

### Certificados
La emisión **guarda una copia** del diseño, nombre y firma (`snapshot`), así que editar la plantilla después no cambia los certificados ya emitidos. `GET /certificates/verify/:code` es público.

### Archivos subidos
- Imágenes → WebP con `sharp` (sin instalar nada más).
- Videos → se recomprimen a H.264/AAC con **ffmpeg** en una cola de uno a la vez. Sin ffmpeg se guardan tal cual.
- Documentos (pdf, doc(x), xls(x), ppt(x), zip, txt; máx. 20 MB) → carpeta `uploads/.private`; se descargan solo con sesión y permiso (`/submission-files/:name`, `/course-files/:id/download`).

### HTML del docente
Todo HTML enriquecido pasa por `cleanHtml` (sanitize-html). Los iframes se permiten para cualquier sitio https externo, con `sandbox` forzado. El frontend aplica la misma regla (`core/html/html-safe.ts`); si cambias una, cambia la otra.

### Pagos simulados
`payments/card.ts` valida la tarjeta (Luhn, vencimiento, CVV) y simula la pasarela con `simulateGateway`. **Nunca se guarda el número completo ni el CVV**, solo marca y últimos 4 dígitos. El importe lo decide el servidor. Para usar una pasarela real hay que sustituir esa función y añadir confirmación por *webhook*.

### Tareas programadas
`notifications/activity-notifications.service.ts` se ejecuta al iniciar la API y cada hora: genera recordatorios para estudiantes con 7 días sin completar una lección (uno por periodo de inactividad). La API debe estar encendida para que corra. Las claves únicas de evento evitan duplicados aunque haya varios procesos.

### Recuperación de contraseña por correo
Configura `SMTP_USER` y `SMTP_PASSWORD` (contraseña de aplicación de Google, con verificación en dos pasos activa) y reinicia la API. El estudiante introduce su correo o documento; el backend envía un código de 6 dígitos **solo al correo guardado**. El código vence en 10 minutos, admite 5 intentos, se reenvía cada 60 s y se almacena como HMAC, no en texto. Al confirmarlo se cambia la contraseña y se cierran todas las sesiones. Endpoints: `POST /auth/password/request-code` y `POST /auth/password/confirm-code`.

## Base de datos y migraciones

- `prisma/schema.prisma` define el modelo (usuarios, cursos, módulos, lecciones, inscripciones, evaluaciones, tareas, certificados, pagos, notificaciones…).
- Tras cambiar el esquema: `npx prisma migrate dev --name descripcion_corta` (crea y aplica la migración). **Versiona la carpeta creada y no edites migraciones ya aplicadas.**
- En otro equipo o en el servidor: `npx prisma migrate deploy`.
- Si al fusionar ramas dos migraciones hacen lo mismo (por ejemplo, agregan la misma columna), elimina la duplicada y márcala con `npx prisma migrate resolve --applied <nombre>`.
- Primer administrador: regístrate y ejecuta `UPDATE users SET role = 'ADMIN' WHERE email = '…';` (no hay *seed*).

## Pruebas

- Los *services* se prueban con el repositorio simulado (`*.service.spec.ts`), sin base de datos, junto al archivo que verifican.
- La lógica pura se aísla en funciones sin dependencias para probarla fácil (`evaluations/scoring.ts`, `course-access/drip.ts`, `payments/card.ts`).
- Cada vez que agregues un campo al `select` de un repositorio, revisa los mocks de las pruebas que lo usan.

## Cómo agregar una funcionalidad nueva

1. Crea `src/modules/<nombre>/` con `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `dto/` y las pruebas.
2. Regístralo en `app.module.ts`.
3. Si necesita datos de otro módulo, importa ese módulo y usa su *service*.
4. Si agrega tablas: `schema.prisma` + migración.
5. Protege las rutas con `JwtAuthGuard` (y `RolesGuard` + `@Roles` si es por rol); valida permisos sobre un curso con `CourseAccessService`.
6. Documenta los endpoints en un `API-<TEMA>.md` y enlázalo en la tabla de módulos.
