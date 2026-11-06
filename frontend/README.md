# Frontend — Plataforma de cursos

Aplicación Angular 22 con componentes standalone, signals, SCSS y soporte SSR. Tiene tres áreas: pública y estudiante, docente y administrador.

## Comandos

Desde `frontend/`:

```bash
npm ci
npm start
npm run build
npm test -- --watch=false
npm run format
npm run format:check
```

El servidor de desarrollo usa `http://localhost:4200`. El backend debe estar iniciado en `http://localhost:3000`; `proxy.conf.json` redirige `/api` al backend. En producción se necesita un reverse proxy equivalente.

## Organización

| Carpeta | Responsabilidad |
| --- | --- |
| `src/app/core/` | Autenticación, permisos, servicios HTTP, idioma, accesibilidad y utilidades compartidas. |
| `src/app/features/auth/` | Páginas y componentes de login y registro. |
| `src/app/features/home/pages/` | Composición de la portada pública y del catálogo. |
| `src/app/features/home/components/` | Secciones visuales de la portada y componentes del catálogo. |
| `src/app/features/student/` | Panel «Mi aprendizaje» y aula del curso (`course-player`: video, recursos, quizzes, tareas, preguntas y certificado). |
| `src/app/features/teacher/` | Panel docente: `summary` (Resumen), `inscritos`, `courses` (Mis cursos y asistente de creación), `modules`, `lessons`, `resources`, `evaluations`, `assignments`, `grading`, `announcements`, `discussions`, `reviews`, `analytics`, `certificates`, `pok`, `profile`. |
| `src/app/features/admin/` | Panel del administrador: resumen, usuarios, cursos y categorías. |
| `src/app/features/notifications/`, `src/app/features/verify/` | Página de notificaciones y verificación pública de certificados. |
| `src/app/shared/layout/` | Encabezado y estructura común de las páginas. |
| `src/app/shared/ui/` | Elementos de interfaz reutilizables. |
| `public/images/` | Imágenes y recursos visuales. |

`app.routes.ts` define las rutas principales. Cada página compone sus componentes; los servicios manejan HTTP y los modelos describen los datos. Mantener el HTML, SCSS y TypeScript de cada componente juntos. Las pruebas se ubican junto al archivo que verifican.

## Rutas y sesión

- `/`: portada informativa; docentes y administradores con sesión se redirigen al panel.
- `/courses` y `/courses/:id`: catálogo público y detalle; con la inscripción hecha, el detalle muestra el aula.
- `/login` y `/register`: acceso y registro.
- `/student/dashboard`: «Mi aprendizaje» (solo estudiantes).
- `/teacher/...`: `dashboard`, `summary`, `students` (Inscritos), `analytics`, `courses` (Mis cursos), `courses/new` y `courses/:id/edit/...` (asistente), evaluaciones, tareas, `quiz-attempts`, `assignments`, `announcements`, `discussions`, `reviews`, `certificates`, `pok` y `profile`. Para docentes y administradores.
- `/admin/...`: `overview`, `users`, `courses` y `categories` (solo administradores).
- `/notifications`, `/verificar` y `/verificar/:code`: notificaciones y verificación pública de certificados.

El login envía `identifier` (correo o documento) y `password`. El token se guarda en `sessionStorage` o en `localStorage` si se selecciona Recordarme. La contraseña no se almacena. Los permisos del frontend complementan las verificaciones del backend.

## Pantallas rediseñadas del docente

Resumen, Inscritos, Mis cursos y POK comparten una misma familia visual: encabezado `px-hero`, tarjetas, etiquetas y avisos. Cada una define sus **tokens de color en `:host`** (para no pisar el resto de la aplicación) y el **modo oscuro** con la clase `html.a11y-dark`. La lógica pura (orden, filtros, formatos, escalas de la gráfica) vive en archivos `*-helpers.ts` / `chart.ts` con pruebas, y las páginas usan signals y `computed`.

## Ver la credencial de POK

En el aula, el botón «Generar certificado» pide la credencial; mientras POK la emite (estado «Pendiente») la pantalla consulta sola cada 3 segundos y muestra «Ver mi credencial en POK» en cuanto queda lista.

## URLs públicas

Las imágenes y archivos propios (`/api/uploads/...`) pasan por `PublicUrlPipe` (`core/http/public-url.pipe.ts`), que aplica la base pública cuando la aplicación se publica bajo un subpath. Las URLs externas no se modifican.

## Estilos y movimiento

- `styles.scss`: base global.
- `panel.scss`: variables y elementos comunes del panel.
- SCSS del componente: composición y apariencia propias.
- Las animaciones de la portada usan APIs nativas del navegador, se inicializan después del renderizado y respetan movimiento reducido.

Prettier usa la configuración de `.prettierrc`. Ejecutar `npm run format` después de editar y `npm run format:check` para verificar.

## Idioma

`core/i18n/language.service.ts` mantiene la preferencia de idioma. Las traducciones están en `core/i18n/translations.ts`; los componentes que traducen texto importan `TranslatePipe` (`t`). Los nombres y logos institucionales se conservan como recursos de marca.

## SSR

Para producción bajo `/cursos-virtuales/`, ejecuta `npm run build:deploy` y sigue la [guía de despliegue](../deploy/README.md). El desarrollo local con `npm start` sigue usando `/`.

Después de compilar:

```bash
npm run serve:ssr:frontend
```

Las credenciales privadas deben permanecer en el backend y no incluirse en el código enviado al navegador.
