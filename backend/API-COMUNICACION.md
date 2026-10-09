# API de comunicación: anuncios, discusiones y notificaciones

Todas las rutas van con `Authorization: Bearer <token>`.

## 1. Anuncios

El docente avisa a los inscritos de un curso.

| Ruta | Quién | Para qué |
|---|---|---|
| `GET /announcements?courseId=&limit=20&offset=0` | todos | Lista según el rol (ver abajo) |
| `POST /courses/:courseId/announcements` | docente del curso, admin | Publica |
| `PATCH /announcements/:id` | docente del curso, admin | Edita `title` y/o `body` |
| `DELETE /announcements/:id` | docente del curso, admin | Borra |

**Quién ve qué en `GET /announcements`:** un docente, los de sus cursos; un admin, todos; un estudiante, los de los cursos
donde está inscrito. Con `courseId`: el docente debe gestionar ese curso y el estudiante estar inscrito, o responde `403`.
Salen del más reciente al más antiguo.

```json
// POST /courses/3/announcements
{ "title": "Cambio de horario", "body": "<p>La clase del jueves será a las <b>8am</b>.</p>", "notify": true }
```

- `body` acepta HTML y se limpia al guardar (igual que en los cursos; ver `API-EVALUACIONES.md`, sección 6). Sin texto visible: `400`.
- `notify` (por defecto `true`): avisa a todos los inscritos con una notificación. `false` publica en silencio.
- La respuesta incluye `notified` (cuántos avisos se crearon). Quien publica no se avisa a sí mismo.

```json
{ "total": 4, "items": [ {
    "id": 7, "title": "Cambio de horario", "body": "<p>…</p>", "createdAt": "…", "updatedAt": "…",
    "author": { "id": 2, "firstName": "Laura", "lastName": "Gómez" },
    "course": { "id": 3, "title": "Curso de Angular" }
} ] }
```

## 2. Notificaciones

Cada usuario ve solo las suyas. Se crean solas cuando pasa algo que le importa.

| Ruta | Para qué |
|---|---|
| `GET /notifications?unread=true&limit=20&offset=0` | Lista (`unread=true` solo las no leídas) |
| `GET /notifications/unread-count` | `{ "unread": 3 }` para el número de la campana |
| `PATCH /notifications/:id/read` | Marca una como leída (una ajena responde `404`) |
| `PATCH /notifications/read-all` | Marca todas, devuelve `{ "marked": n }` |

```json
{ "total": 12, "unread": 3, "items": [ {
    "id": 5, "type": "ANNOUNCEMENT", "title": "Cambio de horario",
    "message": "Nuevo anuncio en «Curso de Angular»",
    "courseId": 3, "refId": 7, "readAt": null, "createdAt": "…"
} ] }
```

El backend no manda enlaces: con `type`, `courseId` y `refId` el frontend arma la ruta.

| `type` | Cuándo | `refId` es |
|---|---|---|
| `ANNOUNCEMENT` | El docente publica un anuncio | id del anuncio |
| `NEW_QUESTION` | Un alumno hace una pregunta (le llega al docente del curso) | id de la pregunta |
| `NEW_REPLY` | Alguien responde tu pregunta o comentario | id de la pregunta o comentario (el hilo) |
| `NEW_REVIEW` | Un alumno deja una reseña en tu curso (solo la primera vez, no al editarla) | id de la reseña |
| `GRADED_ASSIGNMENT` | El docente califica (o corrige la nota de) tu tarea. El título trae la nota: "Calificaron tu tarea: 80 de 100" | id de la **tarea** |
| `GRADED_QUIZ` | El docente termina de revisar las preguntas abiertas de tu quiz. No avisa mientras quede alguna pendiente | id del **quiz** |

## 3. Discusiones: preguntas y respuestas, y comentarios de lección

Participan los **estudiantes inscritos** y quien gestiona el curso (su docente o un admin). Cualquier otra persona recibe `403`.
Todo es **texto plano** (hasta 5000 caracteres), sin HTML.

Una publicación **raíz** es una pregunta (`kind: "QUESTION"`, con título) o un comentario de lección (`kind: "COMMENT"`).
Las **respuestas** cuelgan de una raíz; no se responde a una respuesta.

| Ruta | Quién | Para qué |
|---|---|---|
| `GET /discussions?kind=&courseId=&lessonId=&answered=&limit=20&offset=0` | participantes | Lista raíces |
| `GET /discussions/:id` | participantes | Una raíz con todas sus respuestas |
| `POST /courses/:courseId/questions` | participantes | Hace una pregunta |
| `POST /lessons/:lessonId/comments` | participantes | Comenta una lección |
| `POST /discussions/:id/replies` | participantes | Responde a una raíz |
| `PATCH /discussions/:id` | solo el autor | Edita `body` (y `title` si es pregunta) |
| `DELETE /discussions/:id` | el autor, o el docente del curso / admin (moderar) | Borra; en una raíz se van también sus respuestas |

```json
// POST /courses/3/questions
{ "title": "¿Cómo instalo Angular?", "body": "Me da error al correr npm install", "lessonId": 12 }
// POST /lessons/12/comments   y   POST /discussions/20/replies
{ "body": "Muy buena explicación" }
```

- `lessonId` en una pregunta es opcional y debe ser una lección del mismo curso.
- Si el curso tiene **P y R desactivado** (`qaEnabled: false`), no se pueden hacer preguntas (`403`); los comentarios de lección siguen funcionando.
- **Quién ve qué en el listado:** docente, los de sus cursos; admin, todos; estudiante, los de sus cursos inscritos.
- `answered=false` trae las **preguntas sin responder**, para la bandeja del docente. Una pregunta pasa a `answered: true`
  cuando **responde el docente del curso o un admin** (la respuesta de otro alumno no cuenta). Si luego se borra
  esa respuesta y no queda otra del docente, vuelve a `false`. Los comentarios no usan `answered`.

```json
// GET /discussions → items
{ "id": 20, "kind": "QUESTION", "title": "¿Cómo instalo Angular?", "body": "…", "answered": false,
  "createdAt": "…", "updatedAt": "…",
  "author": { "id": 5, "firstName": "Ana", "lastName": "Ruiz", "role": "STUDENT" },
  "course": { "id": 3, "title": "Curso de Angular" },
  "lesson": { "id": 12, "title": "Instalación" },
  "_count": { "replies": 2 } }
```

`GET /discussions/:id` devuelve la raíz con `replies` (de la más antigua a la más nueva, cada una con su `author`).
El campo `author.role` permite marcar las respuestas del **docente** con una insignia.

## 4. Reseñas

Calificación de 1 a 5 estrellas y un comentario opcional que un estudiante deja sobre un curso. Una por estudiante y curso.

### Público (sin sesión): para la página del curso y el catálogo

Solo existen para cursos **publicados y no privados**; para cualquier otro, `404`.

| Ruta | Para qué |
|---|---|
| `GET /courses/:courseId/reviews?rating=&limit=20&offset=0` | Lista, de la más reciente a la más antigua |
| `GET /courses/:courseId/reviews/summary` | Promedio, cantidad y distribución |

```json
// summary
{ "average": 4.3, "count": 10, "distribution": { "1": 1, "2": 0, "3": 0, "4": 3, "5": 6 } }

// reviews
{ "total": 10, "items": [ { "id": 4, "rating": 5, "comment": "Excelente curso", "createdAt": "…", "updatedAt": "…", "author": "Ana R." } ] }
```

- `average` tiene un decimal y es `null` si todavía no hay reseñas (no mostrar "0 estrellas").
- **Catálogo:** el listado público `GET /courses` y el detalle `GET /courses/:id` ya traen en cada curso
  `rating: { "average": 4.5, "count": 8 }` (`average: null` y `count: 0` si no tiene reseñas), para pintar las estrellas
  en las tarjetas sin pedir el resumen curso por curso.
- Por privacidad el público ve `author` como **nombre + inicial del apellido** ("Ana R."), nunca el apellido completo ni el correo.

### Estudiante inscrito

| Ruta | Para qué |
|---|---|
| `PUT /courses/:courseId/review` | Crea la reseña o, si ya existía, la **reemplaza** |
| `GET /courses/:courseId/review/mine` | Mi reseña (`404` si no he reseñado) |
| `DELETE /courses/:courseId/review` | Borra mi reseña |

```json
{ "rating": 5, "comment": "Excelente curso, muy claro" }
```

- `rating` es un entero de 1 a 5; `comment` es opcional (texto plano, hasta 2000 caracteres).
- Solo puede reseñar quien está inscrito (`403` si no), y solo un estudiante: un docente recibe `403`.
- Cancelar la inscripción después no borra la reseña.
- Al docente le llega una notificación `NEW_REVIEW` la primera vez; editar la reseña no vuelve a avisar.

### Docente

`GET /reviews?courseId=&rating=&limit=20&offset=0` (docente o admin): las reseñas de **sus** cursos (el admin, todas).
Aquí sí ve el nombre completo:

```json
{ "total": 10, "items": [ { "id": 4, "rating": 5, "comment": "…", "createdAt": "…", "updatedAt": "…",
    "student": { "id": 5, "firstName": "Ana", "lastName": "Ruiz" },
    "course":  { "id": 3, "title": "Curso de Angular" } } ] }
```

La calificación promedio también viene en el dashboard (`rating`; ver `API-DASHBOARD.md`).
