# Backend — Plataforma de cursos

API NestJS. Por ahora, `GET /` devuelve `Hello World!`.

## Comandos

Desde `backend/`:

```bash
npm ci
npm run start:dev
npm run build
npm run start:prod
npm run lint
npm test
npm run test:e2e
```

## Configuración

- `PORT`: puerto HTTP; por defecto, `3000`.
- `DATABASE_URL`: conexión PostgreSQL requerida por Prisma.
- `OBSERVE_APP_KEY` y `OBSERVE_APP_SECRET`: credenciales opcionales de NestJS Observe. La observabilidad permanece desactivada si falta alguna.

El backend carga `.env` desde el directorio de ejecución. Ejecutar los comandos desde `backend/`, copiar `.env.example` a `.env` y completar la conexión PostgreSQL. Después de compilar:

```bash
node --env-file=.env dist/main.js
```

No guardar credenciales reales en el código ni en archivos versionados.

El cliente Prisma se genera automáticamente antes de compilar o ejecutar `start:dev`. También se puede generar con `npm run prisma:generate`. Su código queda en `src/generated/prisma` y no se versiona. La generación no modifica las tablas de la base de datos.

## Estructura

- `src/`: módulos, controladores y servicios; pruebas unitarias junto al código.
- `test/`: pruebas de integración HTTP.
