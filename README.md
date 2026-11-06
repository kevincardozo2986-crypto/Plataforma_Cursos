# Plataforma de cursos (Campus Virtual)

Plataforma para crear, publicar y tomar cursos en línea: catálogo público, aula del estudiante con video, quizzes y tareas, panel del docente con analíticas, panel del administrador y certificados (PDF de la plataforma o credencial digital de POK).

- **Backend:** API NestJS 12 + Prisma 7 + PostgreSQL.
- **Frontend:** Angular 22 (componentes standalone, SCSS, SSR).

## Roles

| Rol | Qué hace |
| --- | --- |
| **Estudiante** | Explora el catálogo, se inscribe (gratis, con clave o con pago simulado), estudia en el aula, presenta quizzes, entrega tareas, pregunta, reseña y obtiene su certificado. |
| **Docente** | Crea cursos (asistente en 3 pasos), módulos, lecciones, recursos, quizzes y tareas; publica anuncios; revisa y califica; ve sus inscritos, el resumen y las analíticas; diseña certificados o elige un diseño de POK. |
| **Administrador** | Gestiona cuentas (rol y estado), categorías y todos los cursos, y ve las cifras de toda la plataforma. |

## Estructura

- `backend/`: API, pruebas unitarias y pruebas de sistema (`backend/test/`). Documentación de cada área en `backend/API-*.md` y `backend/ARCHITECTURE.md`.
- `frontend/`: aplicación Angular y servidor SSR.
- `deploy/`: guía de despliegue (`README.md`), seguridad (`SECURITY.md`) y ejemplo de Nginx.

Cada aplicación tiene su propio `package.json` y `package-lock.json`.

## Requisitos

- Node.js 24 (verificado: 24.21.0) y npm 11.
- PostgreSQL.
- FFmpeg (opcional, para procesar los videos que suben los docentes; ruta en `FFMPEG_PATH`).

## Instalación

Desde la raíz:

```bash
npm --prefix backend ci
npm --prefix frontend ci
```

Copia `backend/.env.example` a `backend/.env` y completa al menos `DATABASE_URL` y `JWT_SECRET` (ver [backend/README.md](backend/README.md#configuración)). Luego aplica las migraciones:

```bash
cd backend
npx prisma migrate deploy
```

## Desarrollo

En dos terminales:

```bash
npm --prefix backend run start:dev     # API en http://localhost:3000
npm --prefix frontend start            # Angular en http://localhost:4200
```

El frontend redirige `/api` al backend (`frontend/proxy.conf.json`). Después de cambiar el `.env`, reinicia el backend.

## Verificación

```bash
npm --prefix backend run build
npm --prefix backend run lint
npm --prefix backend test                          # pruebas unitarias
npm --prefix frontend run build
npm --prefix frontend test -- --watch=false
```

**Prueba completa del sistema** (API + navegador, con los tres roles): `node backend/test/full-system.mjs`. Crea sus propias cuentas y las borra al terminar; ver [backend/test/system/README.md](backend/test/system/README.md). Ojo: el backend limita los registros (10 por hora) y los inicios de sesión (30 cada 15 minutos) por IP, así que una corrida completa puede toparse con esos límites; reinicia el backend para reiniciar los contadores.

## Documentación

| Tema | Archivo |
| --- | --- |
| Backend: configuración, módulos, correo, avisos | [backend/README.md](backend/README.md) |
| Arquitectura y reglas entre módulos | [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md) |
| Frontend: rutas, estructura, estilos | [frontend/README.md](frontend/README.md) |
| Despliegue y seguridad | [deploy/README.md](deploy/README.md), [deploy/SECURITY.md](deploy/SECURITY.md) |
| API: contenido y liberación gradual, evaluaciones, tareas, comunicación, certificados, POK, dashboard, pagos, perfil, instructores, admin | `backend/API-*.md` |

## Notas

- No subir credenciales ni archivos `.env`; documentar las variables con valores de ejemplo en `.env.example`.
- La clave de POK (`POK_API_KEY`) vive solo en el backend.
- Los pagos son una **simulación**: no hay pasarela real ni se mueve dinero.
- Zoom aparece como "Próximamente" en el menú del docente y aún no está implementado.
