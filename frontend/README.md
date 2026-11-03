# Frontend — Campus Virtual

Aplicación **Angular 22** con componentes *standalone*, señales (`signal`, `computed`, `effect`), SCSS y renderizado en servidor (SSR). Para la visión general y la puesta en marcha de todo el proyecto, lee primero el [README de la raíz](../README.md).

## Comandos

Desde `frontend/`:

```bash
npm ci
npm start                      # servidor de desarrollo en http://localhost:4200
npm run build                  # compilación de producción
npm test -- --watch=false      # pruebas (vitest, vía ng test)
npm run format                 # prettier
npm run format:check
npm run serve:ssr:frontend     # servir el SSR ya compilado
```

El backend debe estar encendido en `http://localhost:3000`. `proxy.conf.json` redirige `/api/**` al backend quitando el prefijo `/api` (por eso el frontend llama a `/api/courses` y el backend recibe `/courses`). En producción hace falta un *reverse proxy* equivalente.

## Pantallas y rutas

| Ruta | Quién | Qué es |
| --- | --- | --- |
| `/` | público (docentes/admin con sesión se redirigen a su panel) | Portada |
| `/courses` | público | Catálogo |
| `/courses/:id` | público / estudiante | Detalle del curso; si el estudiante está inscrito, se muestra el **aula** (reproductor). Los cursos de pago abren el formulario de pago simulado. Acepta `?tab=preguntas` para abrir esa pestaña. |
| `/login`, `/register` | público | Acceso y registro |
| `/verificar`, `/verificar/:code` | público | Verificación de certificados |
| `/student/dashboard` | estudiante | "Mi aprendizaje": cursos, avance, certificados, notificaciones |
| `/notifications` | con sesión | Todas las notificaciones |
| `/teacher/...` | docente y admin | Panel docente (menú en `features/teacher/shell/teacher-nav.ts`) |
| `/admin/...` | solo admin | Panel del administrador (resumen, usuarios, cursos, categorías) |

`app.routes.ts` define las rutas principales y las protege con `roleGuard`. Las rutas del docente y del admin se cargan de forma perezosa desde `teacher.routes.ts` y `admin.routes.ts`. **Para agregar una sección al panel docente, añádela a `TEACHER_NAV` (da el menú) y a `teacher.routes.ts`** (ver también `teacher-nav.spec.ts`, que lista las secciones esperadas).

## Organización

| Carpeta | Responsabilidad |
| --- | --- |
| `src/app/core/` | Servicios HTTP por dominio (`courses`, `dashboard`, `admin`, `uploads`…), sesión y permisos (`auth/`), notificaciones, idioma, accesibilidad y utilidades (`utils/csv.ts`, `html/html-safe.ts`). |
| `src/app/features/home/` | Portada, catálogo y detalle del curso (con el formulario de pago). |
| `src/app/features/auth/` | Login, registro y recuperación de contraseña. |
| `src/app/features/student/` | `dashboard/` del estudiante y `course-player/` (el aula: video, recursos, tareas, evaluaciones, preguntas, archivos). |
| `src/app/features/teacher/` | Panel docente: `courses/` (lista y asistente), `modules/`, `lessons/`, `resources/`, `evaluations/`, `assignments/`, `grading/`, `certificates/`, `analytics/` (también sirve la pantalla **Inscritos**), `discussions/`, `reviews/`, `announcements/`, `profile/`, `summary/`, `shell/` (marco y menú). |
| `src/app/features/admin/` | Panel del administrador. |
| `src/app/features/verify/` | Verificación pública de certificados. |
| `src/app/shared/layout/` | Encabezado, pie, marco principal y campana de notificaciones. |
| `src/app/shared/ui/` | Componentes reutilizables: `icon`, `rich-editor`, `document-field`, `media-field`, `page-header`, `status-badge`… |
| `public/images/` | Imágenes y recursos visuales. |

Cada página compone sus componentes; los **servicios** manejan HTTP y los **modelos** (`*.models.ts`) describen los datos. Mantén el HTML, SCSS y TypeScript de un componente juntos y las pruebas junto al archivo que verifican.

## Sesión y permisos

- El login envía `identifier` (correo o documento) y `password`. El token se guarda en `sessionStorage`, o en `localStorage` con **Recordarme** (clave `campus.accessToken`). La contraseña nunca se guarda.
- `AuthService` expone el usuario como señal (`auth.user()`); `role.guard.ts` y `public-home.guard.ts` deciden a dónde va cada rol (`core/auth/role-home.ts`: estudiante → `/student/dashboard`, docente → `/teacher/dashboard`, admin → `/admin/overview`).
- **Los guards del frontend solo mejoran la experiencia**: la seguridad real está en el backend.

## Estilos y diseño

- `src/styles.scss`: base global. `src/panel.scss`: **tokens de diseño** (variables `--p-*`) y clases comunes del panel docente/admin (`.panel-card`, `.panel-btn`, `.panel-input`, `.wz-*` del asistente de cursos). Reutilízalas en vez de inventar estilos nuevos.
- Íconos: el componente `<app-icon name="…">` (`shared/ui/icon/icon.ts`) trae unos 50 íconos en SVG; si necesitas uno nuevo, agrégalo ahí (`IconName`).
- Hay modo oscuro y un menú de accesibilidad (tamaño de letra, filtros de color). Las animaciones respetan `prefers-reduced-motion`.
- Prettier usa `.prettierrc`: ejecuta `npm run format` después de editar.

## Idioma

`core/i18n/language.service.ts` guarda la preferencia y las traducciones están en `core/i18n/translations.ts`. Los componentes que traducen usan `TranslatePipe` (`t`). La aplicación está en español (`LOCALE_ID 'es'`).

## Convenciones y trampas conocidas

- **Entradas obligatorias** (`input.required()`): no se pueden leer en el constructor (error NG0950). Cárgalas con `effect()` + `untracked()`, o desde `ngOnInit`.
- **Formularios**: se usa `FormsModule` con `ngModel`. Si un componente no lo importa, `(ngSubmit)` no se dispara: usa `(submit)="$event.preventDefault(); guardar()"` y `novalidate`.
- **Navegar y cerrar un panel a la vez**: no mezcles un `routerLink` con un `(click)` que también navegue; las dos navegaciones compiten y puede ganar la equivocada.
- **Cambiar la entrada de un componente padre**: si un componente hijo destruye a otro al cambiar una señal (por ejemplo, pasar a "inscrito" y cerrar un diálogo), avisa después de cerrar, no antes.
- **HTML del docente**: se pinta con el pipe `richHtml` (y `html-safe.ts`), que replica la sanitización del backend. No uses `[innerHTML]` con texto sin sanear.
- **Archivos privados** (entregas, archivos del curso): se descargan con una petición autenticada que devuelve un *blob*, no con un enlace directo.
- **Errores de la API**: muéstralos con `apiErrorMessage(error, 'mensaje por defecto')` (`core/http/api-error.ts`).
- Hay dos errores de *presupuesto de tamaño* en `ng build` ya existentes (`teacher-dashboard.scss` y `hero.scss`).

## Pruebas

`npm test -- --watch=false` ejecuta vitest sobre los `*.spec.ts` (junto a cada archivo). Cubren sobre todo servicios, utilidades y la lógica de los componentes. Si una prueba falla con "worker exit 134" es falta de memoria cuando hay muchos procesos abiertos: vuelve a ejecutarla.

## SSR

Tras compilar: `npm run serve:ssr:frontend`. Las credenciales privadas deben quedarse en el backend; no las incluyas en el código que llega al navegador.
