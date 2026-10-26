# API del dashboard del docente

`GET /dashboard/teacher` · requiere sesión de **docente** o **admin** (un alumno recibe `403`).

Un docente ve solo sus cursos; un admin ve todos.

| Parámetro | Valores | Para qué |
|---|---|---|
| `period` | `7d`, `30d`, `90d`, `1y`, `all` (por defecto) | Filtra por **fecha de inscripción**. `all` = todo el tiempo. |
| `courseId` | id de un curso | Limita todo a un curso. Si no es tuyo: `403`. |

Un `period` inválido responde `400` con el mensaje "El periodo debe ser uno de: …".

## Respuesta

```json
{
  "period": "30d",
  "since": "2026-09-06T12:00:00.000Z",
  "courses":  { "total": 11, "published": 6, "draft": 4, "archived": 1 },
  "students": 48,
  "completion": {
    "enrolled": 60, "completed": 18, "inProgress": 30, "inactive": 8, "cancelled": 4,
    "rate": 32, "inactiveAfterDays": 30
  },
  "quizzes": { "attempts": 120, "averageScore": 74, "passRate": 81, "pendingReview": 5 },
  "assignments": { "pendingGrading": 7 },
  "rating": { "average": 4.3, "count": 25 },
  "bucket": "day",
  "series": [ { "date": "2026-09-06", "enrollments": 2, "completions": 0 } ],
  "courseBreakdown": [
    { "id": 3, "title": "Curso de Angular", "status": "PUBLISHED",
      "enrolled": 40, "completed": 12, "cancelled": 2, "completionRate": 32, "averageScore": 78,
      "rating": { "average": 4.5, "count": 8 } }
  ]
}
```

## Cómo se calcula cada cifra

- **`courses`:** no depende del periodo.
- **`students`:** alumnos distintos con alguna inscripción en el periodo.
- **`completion.enrolled`:** inscripciones del periodo (incluye canceladas).
  - `completed`: terminó todas las lecciones.
  - `cancelled`: el alumno canceló.
  - `inactive`: inscripción activa que **no avanza ninguna lección hace 30 días o más** (`inactiveAfterDays`).
  - `inProgress`: activas que sí avanzaron en esos 30 días.
  - Las cuatro suman `enrolled`: `completed + inProgress + inactive + cancelled`.
  - `rate`: `completed / (enrolled − cancelled)`, en porcentaje entero.
- **`quizzes`:** solo intentos **ya calificados** del periodo. `averageScore` es 0–100 y `passRate` el % de aprobados.
  `pendingReview` cuenta los intentos esperando calificación manual de preguntas abiertas, sin límite de fecha
  (es el número que va en un aviso "Tienes 5 por revisar", que lleva a la bandeja `GET /evaluation-attempts?status=PENDING_REVIEW`).
- **`assignments.pendingGrading`:** entregas de tareas esperando nota, sin límite de fecha. Junto con `quizzes.pendingReview`
  forma el aviso unificado "Tienes N por revisar" (ver `API-TAREAS.md` y `API-EVALUACIONES.md`).
- **`rating`:** calificación promedio (1 a 5, un decimal) de las **reseñas del periodo** y cuántas son. Con varios cursos es un
  promedio **ponderado** por cantidad de reseñas (un curso con 9 reseñas pesa más que uno con 1). `average` es `null` si no
  hay reseñas. En `courseBreakdown[].rating` viene el de cada curso.
- **`series` (para la gráfica):** inscripciones y finalizaciones por fecha.
  - `bucket` es `day` (`date: "2026-10-06"`) en `7d`, `30d` y `90d`, y `month` (`date: "2026-10"`) en `1y` y `all`.
  - Los días o meses sin movimiento vienen con ceros, así que se puede graficar directo sin rellenar huecos.
  - Las finalizaciones se ubican por la fecha en que se completó el curso, no por la de inscripción.
- **`courseBreakdown[].averageScore`:** `null` si el curso aún no tiene intentos calificados.

## Reportes para las Analíticas

Mismos permisos y filtros `period` y `courseId` que arriba (un curso ajeno responde `403`; un estudiante, `403`).

### `GET /dashboard/teacher/students`

Una fila **por inscripción** de tus cursos. Parámetros extra: `state` (`COMPLETED` | `IN_PROGRESS` | `INACTIVE` | `CANCELLED`), `q` (busca en nombre,
apellido o correo; sin distinguir mayúsculas), `limit` (1–500, por defecto 50) y `offset`. Orden: la inscripción más reciente primero.

```json
{
  "total": 48, "inactiveAfterDays": 30,
  "items": [
    { "enrollmentId": 12,
      "student": { "id": 5, "firstName": "Ana", "lastName": "Ruiz", "email": "ana@campus.com" },
      "course": { "id": 3, "title": "Curso de Angular" },
      "state": "IN_PROGRESS",
      "enrolledAt": "2026-09-01T10:00:00.000Z", "completedAt": null, "lastActivityAt": "2026-10-01T09:30:00.000Z",
      "progress": { "completed": 2, "total": 8, "percent": 25 },
      "quizAverage": 80, "taskAverage": 75 }
  ]
}
```

- `state`: cancelada → `CANCELLED`; terminó todas las lecciones → `COMPLETED`; activa que **no avanza ninguna lección hace 30 días o más** →
  `INACTIVE`; el resto → `IN_PROGRESS` (mismas reglas que `completion` del dashboard).
- `progress.percent`: lecciones hechas / lecciones del curso, de 0 a 100 (un curso sin lecciones da 0).
- `quizAverage`: promedio (0–100) de los intentos de quizzes **ya calificados** de esa persona en ese curso; `taskAverage`: promedio de sus tareas calificadas
  como **porcentaje del puntaje máximo** de cada una. Ambos son `null` si no tiene ninguno.
- `lastActivityAt`: la última lección que marcó como completada (`null` si ninguna).

### `GET /dashboard/teacher/ratings`

```json
{
  "count": 25, "average": 4.3,
  "distribution": [ { "stars": 5, "count": 14, "percent": 56 }, { "stars": 4, "count": 7, "percent": 28 }, "…hasta 1 estrella" ],
  "recent": [ { "id": 9, "rating": 5, "comment": "Excelente", "createdAt": "…", "student": "Ana Ruiz", "course": { "id": 3, "title": "Curso de Angular" } } ]
}
```

`distribution` siempre trae las 5 filas (de 5 a 1 estrella); `recent`, las 20 reseñas más nuevas del periodo.

## Todavía no disponible

Las **ganancias** no están aquí porque dependen del módulo de pagos, que aún no existe. Cuando se construya se agrega
`earnings` a esta misma respuesta.
