# API de evaluaciones (quizzes) y contenido HTML

Guía para quien construye el frontend. Todas las rutas van con `Authorization: Bearer <token>`.

## 1. Tipos de pregunta

| `type` | Cómo la crea el docente | Cómo responde el estudiante | Calificación |
|---|---|---|---|
| `TRUE_FALSE` | `isTrue: true \| false` | `optionIds: [id]` | Automática |
| `SINGLE` (por defecto) | `options` con **una** `isCorrect: true` | `optionIds: [id]` | Automática |
| `MULTIPLE` | `options` con **2 o más** correctas y **al menos 1** incorrecta | `optionIds: [id, id, …]` | Automática, todo o nada |
| `FILL_BLANK` | `acceptedAnswers: ["París", "Ciudad Luz"]` | `text: "paris"` | Automática |
| `ESSAY` (abierta) | solo `text` y `points` (el máximo que podrá dar el docente) | `text: "mi respuesta…"` (hasta 5000 caracteres) | **Manual**, ver sección 5 |

- En `FILL_BLANK` no se distingue mayúsculas, tildes ni espacios de más: `"  PARIS "` acierta `"París"`.
- En `MULTIPLE` no hay puntaje parcial: o se marcan exactamente las correctas, o la pregunta vale 0.
- `points` (opcional, mínimo 1, por defecto 1) pondera cada pregunta en la nota.

## 2. Crear / editar (docente o admin)

`POST /modules/:moduleId/evaluations`  ·  `PATCH /evaluations/:id` (si se envía `questions`, **reemplaza todas**)

```json
{
  "title": "Quiz del módulo 1",
  "description": "Opcional",
  "passingScore": 60,
  "questions": [
    { "type": "TRUE_FALSE", "text": "El cielo es azul", "isTrue": true },
    { "text": "Capital de Colombia", "options": [
        { "text": "Bogotá", "isCorrect": true },
        { "text": "Lima",   "isCorrect": false } ] },
    { "type": "MULTIPLE", "text": "Son lenguajes", "points": 2, "options": [
        { "text": "TypeScript", "isCorrect": true },
        { "text": "Python",     "isCorrect": true },
        { "text": "Excel",      "isCorrect": false } ] },
    { "type": "FILL_BLANK", "text": "La capital de Francia es ____", "acceptedAnswers": ["París", "Ciudad Luz"] }
  ]
}
```

Los errores de regla llegan como `400` con un mensaje en español listo para mostrar, por ejemplo
`"La pregunta 3 (varias respuestas) debe tener al menos 2 opciones correctas y al menos 1 incorrecta"`.

## 3. Ver una evaluación

`GET /evaluations/:id`

- **Docente / admin:** cada pregunta trae `type` y sus `options` con `isCorrect`. En `FILL_BLANK` las `options` son las respuestas aceptadas.
- **Estudiante:** las opciones no traen `isCorrect`, y en `FILL_BLANK` las `options` vienen **vacías** (son la respuesta). Mostrar un campo de texto.
- En `TRUE_FALSE` las opciones son siempre `Verdadero` y `Falso`.

## 4. Presentar un intento (estudiante inscrito)

`POST /evaluations/:id/attempts`

```json
{ "answers": [
    { "questionId": 1, "optionIds": [11] },
    { "questionId": 2, "optionIds": [21] },
    { "questionId": 3, "optionIds": [31, 32] },
    { "questionId": 4, "text": "paris" }
] }
```

Respuesta:

```json
{
  "id": 9, "evaluationId": 1, "score": 80, "passed": true, "status": "GRADED",
  "feedback": null, "createdAt": "…", "gradedAt": null,
  "earnedPoints": 4, "totalPoints": 5, "passingScore": 60,
  "results": [
    { "questionId": 1, "correct": true,  "earned": 1, "points": 1, "comment": null },
    { "questionId": 2, "correct": false, "earned": 0, "points": 4, "comment": null }
  ]
}
```

- `results` dice qué preguntas acertó, **sin revelar** la respuesta correcta.
- `status`: `GRADED` (calificado) o `PENDING_REVIEW` (tiene preguntas abiertas por revisar). Con `PENDING_REVIEW`,
  `score` es **provisional**, `passed` es `false` y las preguntas abiertas vienen con `correct: null` y `earned: null`.
  Mostrar algo como "Tu docente aún debe revisar tus respuestas abiertas".
- Una pregunta abierta puede omitirse (vale 0). Si se envía, no puede ir en blanco.
- Una pregunta sin responder vale 0. No se puede responder la misma pregunta dos veces.
- `optionId: 11` (un solo número) se sigue aceptando como atajo de `optionIds: [11]`.
- `GET /evaluations/:id/attempts/mine` lista los intentos propios.

## 5. Revisión de intentos (docente o admin)

Un docente ve solo los intentos de **sus** cursos; un admin, todos. Un alumno recibe `403`.

**Bandeja:** `GET /evaluation-attempts?courseId=&evaluationId=&status=PENDING_REVIEW|GRADED&limit=20&offset=0`
(todos los filtros son opcionales; `limit` máximo 100). Primero salen los pendientes y luego los más recientes.

```json
{ "total": 12, "items": [ {
    "id": 9, "status": "PENDING_REVIEW", "score": 20, "passed": false,
    "createdAt": "…", "gradedAt": null,
    "student":    { "id": 5, "firstName": "Ana", "lastName": "Ruiz", "email": "ana@campus.com" },
    "evaluation": { "id": 1, "title": "Quiz del módulo 1" },
    "course":     { "id": 3, "title": "Curso de Angular" }
} ] }
```

**Detalle:** `GET /evaluation-attempts/:id` devuelve lo anterior más `feedback`, `earnedPoints`, `totalPoints` y `questions`,
una por pregunta, con lo que respondió el estudiante y lo esperado (**solo lo ve el docente**):

```json
{ "questionId": 2, "text": "Explica qué es una API", "type": "ESSAY", "points": 4,
  "correct": null, "earned": null, "written": "Es una interfaz…", "graded": false }
{ "questionId": 1, "text": "Capital de Colombia", "type": "SINGLE", "points": 1,
  "correct": true, "earned": 1, "chosen": ["Bogotá"], "expected": ["Bogotá"] }
```

El intento guarda una copia de las preguntas al presentarse: si el docente edita el quiz después, la revisión no se rompe.

**Calificar:** `PATCH /evaluation-attempts/:id/grade`

```json
{ "grades": [ { "questionId": 2, "points": 3, "comment": "Falta mencionar HTTP" } ],
  "feedback": "Buen trabajo en general" }
```

- Solo se califican preguntas **abiertas con respuesta**; `points` es un entero entre 0 y el máximo de la pregunta.
- Cuando no queda ninguna abierta sin calificar, el intento pasa a `GRADED`, se recalcula `score` y `passed`, y se guarda `gradedAt`.
- Se puede volver a llamar para **corregir** una nota ya puesta.
- Devuelve el mismo detalle de arriba, ya actualizado.
- El alumno ve la nota final, `feedback` y el `comment` de cada pregunta en `GET /evaluations/:id/attempts/mine`.

## 6. Campos que aceptan HTML

Se pueden escribir con HTML estos campos:

- Curso: `description`, `whatYouWillLearn`, `audience`, `materials`, `requirements`
- Módulo: `description`
- Lección: `content`

El servidor **limpia el HTML al guardarlo**, así que lo que se lee de la API ya es seguro para mostrar
(en Angular, `[innerHTML]`; no hace falta `bypassSecurityTrustHtml`).

**Se conserva:** `p br hr div span h2–h6 strong b em i u s sub sup mark small ul ol li blockquote pre code a img figure figcaption table thead tbody tfoot tr th td caption`.

**Videos incrustados:** solo `<iframe>` de `www.youtube.com`, `www.youtube-nocookie.com` y `player.vimeo.com`.

**Se elimina:** `<script>`, `<style>`, formularios, `<object>`/`<embed>`, iframes de otros sitios, atributos `style` y `on…` (onclick, onerror…), y enlaces `javascript:` o `data:`.
Los enlaces con `target="_blank"` reciben `rel="noopener noreferrer"` automáticamente.

Notas:
- Las imágenes pueden apuntar a `https://…` o a un archivo subido (`/api/uploads/<id>.webp`).
- Una descripción vacía (`<p></p>`, `<p><br></p>`) cuenta como vacía al publicar el curso.
- El editor del frontend puede mostrar un editor enriquecido o una caja de código; el backend recibe en ambos casos un `string` con HTML.
