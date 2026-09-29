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
- `OBSERVE_APP_KEY` y `OBSERVE_APP_SECRET`: credenciales opcionales de NestJS Observe. La observabilidad permanece desactivada si falta alguna.

Las variables se leen del entorno del proceso. El proyecto no carga `.env` automáticamente. Para usar un archivo local, copiar `.env.example` a `.env`, completar sus valores y, después de compilar, ejecutar desde esta carpeta:

```bash
node --env-file=.env dist/main.js
```

No guardar credenciales reales en el código ni en archivos versionados.

## Estructura

- `src/`: módulos, controladores y servicios; pruebas unitarias junto al código.
- `test/`: pruebas de integración HTTP.
