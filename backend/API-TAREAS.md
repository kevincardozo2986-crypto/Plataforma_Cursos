# API de tareas (assignments)

Una tarea es un ítem calificable de un módulo, igual que las lecciones y los quizzes. Todas las rutas van con
`Authorization: Bearer <token>`.

## 1. Gestión (docente o admin)

| Ruta | Para qué |
|---|---|
| `GET /modules/:moduleId/assignments` | Lista las tareas del módulo (cualquier usuario que vea el curso) |
| `POST /modules/:moduleId/assignments` | Crea una tarea |
| `GET /assignments/:id` | Una tarea |
| `PATCH /assignments/:id` | Edita (todo opcional) |
| `DELETE /assignments/:id` | Borra la tarea **y los archivos de todas sus entregas** |

```json
{
  "title": "Informe del módulo 1",
  "description": "<p>Entrega un <b>PDF</b> de máximo 5 páginas.</p>",
  "dueAt": "2026-11-30T23:59:00-05:00",
  "allowLate": true,
  "maxScore": 100
}
```

- `description` acepta HTML (se limpia igual que en los cursos; ver `API-EVALUACIONES.md`, sección 6).
- `dueAt` es opcional (ISO 8601). En el `PATCH`, `"dueAt": null` **quita** la fecha límite.
- `allowLate` (por defecto `true`): con `false`, pasada la fecha ya no se aceptan entregas.
- `maxScore` (por defecto 100, máximo 1000). No se puede bajar por debajo de una nota ya puesta.

**Lista del módulo:** cada tarea trae `submissionCount` (cuántas entregas tiene) y `mySubmission`
(`{ status, score, late, submittedAt }` del usuario que consulta, o `null`). Sirve para mostrar el estado de cada tarea
al estudiante sin pedir una por una.

## 2. Entregar (estudiante inscrito)

### 2.1 Subir los archivos

`POST /uploads/documents` · `multipart/form-data`, campo `file` · máximo **20 MB** · requiere sesión.

Formatos: `pdf, doc, docx, xls, xlsx, ppt, pptx, zip, txt`. Se comprueba el **contenido**, no solo la extensión:
un programa renombrado a `.pdf` se rechaza con `400`.

```json
{ "name": "5fa0933d338c93a12e935efd468ca583.pdf", "originalName": "Mi Tarea.pdf", "size": 1045, "uploadedBy": 28 }
```

El archivo queda **privado**: no se puede pedir por `/uploads/…`. Se sube uno por petición; para varios, varias peticiones.

### 2.2 Enviar la entrega

`PUT /assignments/:id/submission` (solo estudiantes inscritos)

```json
{ "text": "Mi respuesta…", "files": [ { "name": "5fa0933d338c93a12e935efd468ca583.pdf" } ] }
```

- Hace falta **texto, archivos, o ambos** (hasta 10 archivos).
- Solo se puede adjuntar un archivo **que subió el mismo estudiante** y que no esté en otra entrega.
- Se puede **reenviar** mientras no esté calificada: reemplaza la entrega anterior y borra los archivos que ya no se usan.
- Una entrega **calificada** ya no se puede cambiar (`400`).
- Pasada la fecha límite: si `allowLate` es `true` se acepta y queda con `late: true`; si no, `400`.

Respuesta (igual que `GET /assignments/:id/submission/mine`, que da `404` mientras no haya entregado):

```json
{
  "id": 9, "assignmentId": 1, "status": "SUBMITTED", "late": false,
  "text": "Mi respuesta…",
  "files": [ { "name": "5fa0….pdf", "originalName": "Mi Tarea.pdf", "size": 1045, "url": "/api/submission-files/5fa0….pdf" } ],
  "score": null, "feedback": null, "submittedAt": "…", "gradedAt": null
}
```

`status`: `SUBMITTED` (esperando nota) o `GRADED` (con `score` y `feedback`).

## 3. Descargar un archivo

`GET /submission-files/:name` · **requiere el token**, así que no sirve un `<a href>` directo: pedirlo con `HttpClient`
como `blob` y descargarlo en el navegador (`URL.createObjectURL`). El nombre para guardar está en `originalName`.

- Lo descarga quien lo entregó y el docente del curso (o un admin).
- Para cualquier otra persona responde `404`, como si no existiera.
- Siempre llega como descarga (`Content-Disposition: attachment`), nunca se muestra dentro de la página.

## 4. Revisión del docente

Un docente ve solo las entregas de **sus** cursos; un admin, todas. Un estudiante recibe `403`.

**Bandeja:** `GET /assignment-submissions?courseId=&assignmentId=&status=SUBMITTED|GRADED&limit=20&offset=0`
(todo opcional; `limit` máximo 100). Primero salen las pendientes y luego las más recientes.

```json
{ "total": 3, "items": [ {
    "id": 9, "status": "SUBMITTED", "late": false, "score": null, "maxScore": 100,
    "submittedAt": "…", "gradedAt": null,
    "student":    { "id": 5, "firstName": "Ana", "lastName": "Ruiz", "email": "ana@campus.com" },
    "assignment": { "id": 1, "title": "Informe del módulo 1" },
    "course":     { "id": 3, "title": "Curso de Angular" }
} ] }
```

**Detalle:** `GET /assignment-submissions/:id` → lo anterior más `text`, `files` (con `url`), `feedback`, y `assignment.dueAt`.

**Calificar:** `PATCH /assignment-submissions/:id/grade`

```json
{ "score": 85, "feedback": "Buen trabajo, falta citar las fuentes." }
```

- `score` es un entero entre 0 y el `maxScore` de la tarea; fuera de rango, `400`.
- La entrega pasa a `GRADED`. Se puede volver a llamar para **corregir** la nota.
- Devuelve el detalle actualizado.

## 5. Bandeja unificada (quizzes + tareas)

El PDF pide una sola bandeja para calificar. Son dos listas porque tienen datos distintos; el frontend puede mostrarlas
juntas con pestañas, o mezclarlas:

- Quizzes con preguntas abiertas: `GET /evaluation-attempts?status=PENDING_REVIEW`
- Tareas: `GET /assignment-submissions?status=SUBMITTED`

Para el número del aviso ("Tienes N por revisar") usa el dashboard: `quizzes.pendingReview + assignments.pendingGrading`
(`GET /dashboard/teacher`, ver `API-DASHBOARD.md`).
