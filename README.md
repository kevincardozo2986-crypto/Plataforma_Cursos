# Plataforma de cursos

Base de una plataforma de cursos con una API en NestJS y una interfaz en Angular con renderizado del lado del servidor (SSR).

El proyecto está en su etapa inicial: conserva las pantallas y endpoints de ejemplo. Los módulos de usuarios, autenticación y cursos aún no están implementados.

## Estructura

- `backend/`: API NestJS, pruebas unitarias y pruebas de integración.
- `frontend/`: aplicación Angular, estilos SCSS y servidor SSR.

Ambas aplicaciones se versionan en un único repositorio y mantienen sus propios archivos `package.json` y `package-lock.json`.

## Requisitos

- Node.js 24.15 o superior de la rama 24 (entorno verificado: 24.21.0).
- npm 11 (entorno verificado: 11.19.0).

## Instalación

Desde la raíz:

```bash
npm --prefix backend ci
npm --prefix frontend ci
```

## Desarrollo

Ejecutar cada comando en una terminal diferente:

```bash
npm --prefix backend run start:dev
```

```bash
npm --prefix frontend start
```

La API escucha en `http://localhost:3000` y Angular en `http://localhost:4200`. La interfaz todavía no consume la API.

Consultar [la configuración del backend](backend/README.md) y [los comandos del frontend](frontend/README.md).

## Verificación

```bash
npm --prefix backend run build
npm --prefix backend run lint
npm --prefix backend test
npm --prefix backend run test:e2e
npm --prefix frontend run build
npm --prefix frontend test -- --watch=false
```

## Organización al crecer

Agregar módulos de dominio en `backend/src/` (por ejemplo, `auth`, `users` y `courses`) y funcionalidades en `frontend/src/app/` conforme se implementen. Mantener junto a cada funcionalidad sus componentes y pruebas.

No subir credenciales ni archivos `.env`; documentar las variables con valores de ejemplo en `.env.example`.
