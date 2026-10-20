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


## Verificacion de cambio de contrasena por Gmail

En `backend/.env` configura `SMTP_USER` (el Gmail que envia los correos) y
`SMTP_PASSWORD` (una contrasena de aplicacion de Google). `SMTP_HOST=smtp.gmail.com`
y `SMTP_PORT=465` ya estan preparados. No uses la contrasena habitual de Gmail.
Activa la verificacion en dos pasos y crea la contrasena de aplicacion:
https://support.google.com/accounts/answer/185833?hl=es
Reinicia la API despues de configurar estas variables. La direccion del remitente
no tiene que coincidir con el proveedor de correo del estudiante.

Desde Mi cuenta, el estudiante introduce su correo o cedula. El backend comprueba
que pertenece a la sesion y envia un codigo de seis digitos al correo guardado,
nunca a una direccion arbitraria. El codigo vence en 10 minutos, admite cinco
intentos y se puede reenviar cada 60 segundos. Se almacena un HMAC del codigo,
no su texto. Al confirmar, se consume en una escritura atomica junto con el cambio
de contrasena y la revocacion de las sesiones. Se requiere volver a iniciar sesion.
Los errores de SMTP no se presentan como envios exitosos; no se imprimen codigos.

Endpoints autenticados: `POST /auth/password/request-code` con `{ identifier }`
y `POST /auth/password/confirm-code` con `{ code, newPassword }`.


## Avisos de actividad dentro de la plataforma

- Publicar un curso publico crea un aviso para los estudiantes activos. Volver a
  publicar el mismo curso no repite el aviso para el mismo estudiante.
- Cambiar la contrasena (desde perfil o mediante codigo) crea un aviso de seguridad
  para el propietario. Nunca incluye la contrasena ni el codigo.
- Al iniciar la API y cada hora se revisan cursos activos con lecciones y al menos
  siete dias sin completar una leccion. Si no hay progreso, se cuenta desde la
  inscripcion. Se genera un solo recordatorio por periodo de inactividad; completar
  otra leccion habilita un nuevo periodo. Se excluyen cuentas inactivas, cursos
  sin publicar e inscripciones completadas o canceladas.

Son avisos en el menu del avatar, no correos. La API debe permanecer encendida para
la revision por hora; al volver a arrancarla se revisa lo pendiente. Las claves
unicas de evento evitan duplicados incluso si hay varios procesos de la API.


## Aula multimedia del estudiante

Los recursos de una leccion admiten PDF, VIDEO, AUDIO, IMAGE, INTERACTIVE, LINK,
DOCUMENT y OTHER. El docente puede agregarlos por enlace desde Recursos; el aula
los muestra dentro de la leccion con acceso al original. La subida directa de
archivos de audio/PDF y paquetes SCORM/H5P requiere un flujo adicional: un enlace
INTERACTIVE sirve para una actividad web que permita ser incrustada, no importa
paquetes ni registra puntuaciones SCORM.

El estudiante puede consultar preguntas y sus respuestas, participar en la
conversacion y practicar HTML/CSS/JavaScript en una vista previa con sandbox sin
same-origin y CSP que bloquea conexiones externas. El editor no ejecuta Python ni
codigo del lado del servidor, y sus borradores son locales por usuario/curso/leccion.
No son entregas calificadas. Las notas tambien son locales. El progreso de las
lecciones, las preguntas y las respuestas se guardan mediante las APIs existentes.
