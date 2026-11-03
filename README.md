# Campus Virtual — Plataforma de cursos

Plataforma web para publicar y tomar cursos en línea: los **docentes** crean cursos (módulos, lecciones, evaluaciones, tareas, certificados), los **estudiantes** se inscriben, estudian y obtienen un certificado verificable, y los **administradores** gestionan usuarios, cursos y categorías.

| Parte | Tecnología | Puerto |
| --- | --- | --- |
| [`backend/`](backend/README.md) | NestJS 12 + Prisma 7 + PostgreSQL | `3000` |
| [`frontend/`](frontend/README.md) | Angular 22 (componentes standalone, señales, SSR) | `4200` |

Ambas aplicaciones viven en este repositorio y tienen su propio `package.json`. **Empieza por este archivo y luego lee el README de la parte en la que vayas a trabajar.**

---

## 1. Qué hace la plataforma

Hay tres roles (`STUDENT`, `TEACHER`, `ADMIN`). Cada uno tiene su zona:

### Estudiante (`/student/dashboard`, `/courses/:id`)
- Explora el catálogo público, se inscribe (gratis, con contraseña del curso, o pagando) y estudia en el **aula** (reproductor del curso).
- Aula: video (YouTube, Vimeo o archivo subido) con seguimiento real del porcentaje visto, recursos, notas personales, práctica de HTML/CSS/JS, evaluaciones (quizzes), **tareas** (entrega de archivos y nota), archivos del curso, preguntas al docente y anuncios.
- Una lección con video solo se completa viendo al menos el 90 % de tramos distintos.
- Al terminar todo (lecciones, evaluaciones aprobadas y tareas con al menos 60 %) obtiene un **certificado en PDF** con código de verificación público (`/verificar/:codigo`).
- Recibe notificaciones (campana): nuevo curso, respuesta a su pregunta, anuncios, recordatorios de inactividad, etc.
- Puede recuperar su contraseña con un código enviado al correo (Gmail/SMTP).

### Docente (`/teacher/...`)
- **Cursos**: asistente de creación (datos básicos, contenido, adicionales), módulos, lecciones con editor de texto enriquecido (admite iframes de cualquier sitio https), recursos, archivos descargables, liberación gradual del contenido (*drip*), varios instructores por curso, prerrequisitos, precio, cupo y contraseña.
- **Evaluaciones** (quizzes con varios tipos de pregunta y calificación) y **Tareas** (con documentos adjuntos del docente y calificación de las entregas).
- **Certificados**: constructor de plantillas (13 diseños, imagen de fondo propia, posición y estilo del texto) y asignación a un curso.
- **Inscritos**: lista de estudiantes con avance y notas; **Analíticas** con gráficas y exportación a CSV; **Resumen**, **Discusiones**, **Reseñas**, **Anuncios** y **Mi perfil** (con foto y firma para certificados).

### Administrador (`/admin/...`)
- Resumen general, gestión de **usuarios** (crear, cambiar rol, activar/desactivar, generar contraseña), **cursos** de todos los docentes y **categorías**.
- También entra al panel docente y ve todos los cursos.

### Pagos (simulados)
Los cursos con precio se compran con un formulario de tarjeta **simulado**: no hay pasarela real ni se cobra dinero. Hay tarjetas de prueba (por ejemplo `4242 4242 4242 4242` aprueba y `4000 0000 0000 0002` rechaza). Ver [`backend/API-PAGOS.md`](backend/API-PAGOS.md). Para producción habría que reemplazar `simulateGateway` por una pasarela real.

---

## 2. Puesta en marcha

### Requisitos
- Node.js 24 (verificado con 24.21.0) y npm 11.
- PostgreSQL (una base de datos vacía, por ejemplo `db_plataforma_cursos`).
- Opcional: **ffmpeg** (comprime los videos subidos; sin él se guardan tal cual).
- Opcional: una cuenta Gmail con *contraseña de aplicación* para el envío de códigos de recuperación.

### Pasos

```bash
# 1. Dependencias (desde la raíz)
npm --prefix backend ci
npm --prefix frontend ci

# 2. Configuración del backend
cp backend/.env.example backend/.env      # en Windows: copy backend\.env.example backend\.env
#    Edita backend/.env: DATABASE_URL (usuario/clave de tu PostgreSQL) y JWT_SECRET (una cadena larga y aleatoria)

# 3. Crear las tablas
cd backend
npx prisma migrate deploy
cd ..

# 4. Arrancar (dos terminales)
npm --prefix backend run start:dev        # API en http://localhost:3000
npm --prefix frontend start               # Web en http://localhost:4200
```

Abre http://localhost:4200. El frontend llama a `/api/...` y el servidor de desarrollo lo redirige al backend (`frontend/proxy.conf.json`).

### El primer administrador
No hay datos de ejemplo (*seed*). Cualquier persona que se registra queda como **estudiante**. Para crear el primer administrador:

1. Regístrate normalmente en `/register`.
2. Cambia tu rol directamente en la base de datos:
   ```sql
   UPDATE users SET role = 'ADMIN' WHERE email = 'tu@correo.com';
   ```
3. Cierra sesión y vuelve a entrar: serás redirigido a `/admin/overview`.

Desde ahí, el administrador crea docentes y otros administradores en **Usuarios**.

---

## 3. Variables de entorno (`backend/.env`)

| Variable | Para qué sirve |
| --- | --- |
| `DATABASE_URL` | Conexión PostgreSQL (obligatoria). |
| `JWT_SECRET` | Firma de los tokens de sesión (obligatoria; en producción, larga y secreta). |
| `PORT` | Puerto de la API (por defecto `3000`). |
| `APP_URL` | Dirección pública de la web; se imprime en los certificados como enlace de verificación. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Correo para los códigos de recuperación de contraseña. |
| `UPLOADS_DIR` | Carpeta de archivos subidos (por defecto `./uploads`; **respáldala**). |
| `FFMPEG_PATH`, `VIDEO_*`, `IMAGE_*` | Compresión de videos e imágenes (todas opcionales). |
| `FONTS_DIR` | Fuentes de los certificados (por defecto `backend/assets/certificate-fonts`). |
| `OBSERVE_APP_KEY`, `OBSERVE_APP_SECRET` | NestJS Observe (opcional). |

El archivo `.env` **no se sube a git**; `backend/.env.example` documenta cada variable.

---

## 4. Mapa del repositorio

```
Plataforma_Cursos/
├── backend/                 API NestJS
│   ├── prisma/              schema.prisma y migraciones (la fuente de verdad de la base de datos)
│   ├── src/modules/         un módulo por funcionalidad (controller → service → repository)
│   ├── src/common/          decoradores, DTOs y utilidades compartidas
│   ├── uploads/             archivos subidos (no se versiona)
│   ├── API-*.md             documentación de los endpoints por tema
│   └── ARCHITECTURE.md      reglas de arquitectura y de dependencias entre módulos
├── frontend/                Angular
│   ├── src/app/core/        servicios HTTP, sesión, permisos, utilidades
│   ├── src/app/features/    pantallas por rol: home, auth, student, teacher, admin, verify
│   ├── src/app/shared/      layout y componentes reutilizables (icono, editor, etc.)
│   └── src/panel.scss       tokens de diseño y clases del panel (docente/admin)
└── .preview/                capturas y scripts de auditoría visual (no son parte de la app)
```

### Dónde está la documentación detallada
- Arquitectura del backend: [`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md).
- Endpoints, reglas y ejemplos por tema (en `backend/`): `API-ADMIN.md`, `API-CERTIFICADOS.md`, `API-COMUNICACION.md`, `API-CONTENIDO.md`, `API-DASHBOARD.md`, `API-EVALUACIONES.md`, `API-INSTRUCTORES.md`, `API-PAGOS.md`, `API-PERFIL.md`, `API-TAREAS.md`.
- Estructura del frontend, rutas y convenciones: [`frontend/README.md`](frontend/README.md).
- Colección de Postman: `backend/postman/`.

---

## 5. Cómo funciona por dentro (lo esencial)

1. **Autenticación**: el login (`POST /auth/login`, con correo o documento) devuelve un JWT. El frontend lo guarda y lo envía como `Authorization: Bearer`. En **cada petición** el backend vuelve a leer el rol y el estado del usuario en la base de datos, y cambiar la contraseña o desactivar a alguien invalida sus sesiones (`sessionVersion`).
2. **Permisos**: los guards de Nest (`JwtAuthGuard`, `RolesGuard`) validan el rol; las reglas "¿puede gestionar/ver este curso?" están centralizadas en `modules/course-access`. Gestionan un curso su autor, sus instructores y los administradores. El frontend también oculta pantallas por rol, pero **la seguridad real es la del backend**.
3. **Inscripción** (`modules/progress`): reglas de acceso (publicado, contraseña, cupo, prerrequisitos y pago si el curso tiene precio). Estudiar crea progreso por lección; completar todo emite el certificado.
4. **Certificados** (`modules/certificates`): se emite una **copia congelada** del diseño, nombre y firma, de modo que no cambia aunque luego se edite el curso o la plantilla. El PDF se genera en el servidor con `pdfkit`.
5. **Archivos subidos** (`modules/uploads`): imágenes (se pasan a WebP), videos (se recomprimen con ffmpeg en una cola) y documentos **privados** (tareas, archivos del curso) que solo se descargan con sesión y permiso.
6. **HTML del docente**: todo contenido enriquecido se **sanitiza** en el servidor (`sanitize-html`) y otra vez en el cliente (`core/html/html-safe.ts`). Los iframes llevan `sandbox` forzado.
7. **Notificaciones** (`modules/notifications`): cualquier módulo avisa con `NotificationsService.notify`. Un proceso interno revisa cada hora a los estudiantes inactivos y genera recordatorios (por eso la API debe estar encendida).

---

## 6. Verificación y calidad

```bash
# Backend (desde la raíz)
npm --prefix backend run build
npm --prefix backend run lint
npm --prefix backend test
# Frontend
npm --prefix frontend run build
npm --prefix frontend test -- --watch=false
```

- Hay cientos de pruebas unitarias en cada parte (los *services* del backend se prueban con el repositorio simulado, sin base de datos).
- **Antes de dar algo por terminado, pruébalo en el navegador**: las pruebas unitarias no detectan problemas de integración (rutas, permisos, estilos).
- Hay dos errores de *presupuesto de tamaño* en `ng build` que ya existían: `teacher-dashboard.scss` y `hero.scss`. No impiden usar la app en desarrollo.

---

## 7. Estado y pendientes

**Hecho**: las tres zonas (estudiante, docente, administrador), certificados, tareas, evaluaciones, analíticas, pagos simulados y notificaciones.

**Pendiente / ideas para quien continúe**
- **Clases en vivo con Zoom**: aparece en el menú docente como "Próximamente"; requiere credenciales reales de Zoom (Server-to-Server OAuth).
- **Pasarela de pago real** (hoy es simulada). Una vez hecha, mostrar las ganancias del docente en Analíticas y una lista de pagos al administrador (el modelo `Payment` ya guarda los comprobantes).
- Pantalla de **"Mis pagos"** para el estudiante (la API `GET /payments/mine` ya existe).
- CORS está fijado a `http://localhost:4200` en `backend/src/main.ts`: hay que parametrizarlo al desplegar. En producción también hace falta un *reverse proxy* que reenvíe `/api` al backend (en desarrollo lo hace `proxy.conf.json`).
- No existe un *seed* de datos de ejemplo.

---

## 8. Convenciones de trabajo

- **Ramas**: se trabaja en ramas propias y se fusiona a `main`. Si dos ramas agregan migraciones de Prisma que tocan lo mismo (por ejemplo, la misma columna), al fusionar habrá que eliminar la duplicada y marcarla como aplicada con `npx prisma migrate resolve --applied <nombre>`.
- **Cambios en la base de datos**: edita `backend/prisma/schema.prisma`, crea una migración (`npx prisma migrate dev --name lo_que_cambia`) y versiona la carpeta generada. Nunca modifiques una migración ya aplicada.
- **Backend**: cada funcionalidad es un módulo con las capas controller → service → repository. Las reglas de negocio van en el *service*; el único sitio con consultas Prisma es el *repository*. Detalle en `backend/ARCHITECTURE.md`.
- **Frontend**: componentes standalone con señales; HTML, SCSS y TypeScript juntos y las pruebas junto al archivo. Usa los tokens y clases de `src/panel.scss` para mantener la misma apariencia del panel.
- **Seguridad**: no subas `.env` ni credenciales. Nunca guardes números completos de tarjeta ni contraseñas en texto plano.
- Los textos de la interfaz y los mensajes de error van en **español**.
