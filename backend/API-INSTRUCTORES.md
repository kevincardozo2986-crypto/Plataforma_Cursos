# Varios instructores por curso

Un curso tiene un **autor** (el docente que lo creó, campo `teacher`) y hasta **10 instructores** más. Los instructores comparten
la gestión del curso con el autor.

## 1. Quién puede qué

| Acción | Autor | Instructor | Admin |
|---|:---:|:---:|:---:|
| Editar curso, módulos, lecciones, recursos, quizzes y tareas | ✅ | ✅ | ✅ |
| Leer el contenido aunque el módulo esté cerrado (vista previa) | ✅ | ✅ | ✅ |
| Calificar quizzes y tareas, ver las bandejas de revisión | ✅ | ✅ | ✅ |
| Publicar anuncios, responder preguntas, ver reseñas | ✅ | ✅ | ✅ |
| Ver el dashboard del curso | ✅ | ✅ | ✅ |
| Archivar o publicar el curso | ✅ | ✅ | ✅ |
| **Borrar el curso** | ✅ | ❌ | ✅ |
| **Agregar o quitar instructores** | ✅ | ❌ (solo salirse él mismo) | ✅ |

Para un instructor el curso aparece en **todo** lo que antes era "mis cursos": `GET /courses/manage`, las bandejas
(`/evaluation-attempts`, `/assignment-submissions`), `/announcements`, `/discussions`, `/reviews` y `/dashboard/teacher`.

## 2. Rutas

| Ruta | Quién | Para qué |
|---|---|---|
| `GET /courses/:id/instructors` | quien gestiona el curso | Autor e instructores |
| `POST /courses/:id/instructors` | autor, admin | Agrega un instructor |
| `DELETE /courses/:id/instructors/:userId` | autor, admin; o el propio instructor | Quita un instructor / salirse |

```json
// POST /courses/3/instructors
{ "email": "luis@campus.com" }
```

- Se agrega por **correo** (no distingue mayúsculas). Debe ser una cuenta con rol **docente** y activa: un estudiante, un admin o
  una cuenta inactiva se rechazan con `400`. Un correo sin cuenta responde `404`.
- No se puede agregar al autor ni repetir a un instructor (`400`). Máximo 10 instructores (`400`).
- Al agregado le llega una notificación `INSTRUCTOR_ADDED` (`courseId` del curso).

Respuesta de `GET` y de `POST` (el equipo actualizado):

```json
{
  "owner": { "id": 2, "firstName": "Laura", "lastName": "Gómez", "email": "laura@campus.com" },
  "instructors": [
    { "id": 9, "firstName": "Luis", "lastName": "Pérez", "email": "luis@campus.com", "addedAt": "2026-10-09T16:00:00.000Z" }
  ]
}
```

`DELETE` devuelve el equipo actualizado; si quien lo llama es **el propio instructor saliéndose**, devuelve `{ "left": true }`
(ya no tiene acceso, así que no se le muestra el equipo). Al autor no se le puede quitar (`400`). Quitar a quien no es
instructor responde `404`. Al salirse o ser quitado, pierde el acceso al instante.

## 3. Cambios en lo que devuelve la API

- `GET /courses/manage` y `GET /courses/manage/:id`: cada curso trae `isOwner` (`true` si es el autor o un admin; `false` si el
  docente solo es instructor). Úsalo para ocultar el botón de **borrar** y la pantalla de **instructores** a quien no puede.
- `GET /courses/:id` (detalle público): trae `instructors: [{ id, firstName, lastName }]` (sin correo). El autor sigue en
  `teacher`. Para mostrar "Por Laura Gómez y Luis Pérez" juntar `teacher` + `instructors`.
- Notificaciones: las **preguntas nuevas** (`NEW_QUESTION`) y las **reseñas nuevas** (`NEW_REVIEW`) le llegan al autor **y** a
  todos los instructores. Una pregunta queda respondida (`answered: true`) cuando responde el autor, un instructor o un admin.

## 4. Notas

- El autor es el campo `teacherId` del curso y no cambia al agregar instructores. No hay "transferir autoría" por ahora.
- Un instructor sigue siendo una cuenta de docente: si un admin cambia su rol a estudiante, pierde el acceso sin necesidad de quitarlo.
