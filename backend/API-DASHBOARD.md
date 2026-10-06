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
  "bucket": "day",
  "series": [ { "date": "2026-09-06", "enrollments": 2, "completions": 0 } ],
  "courseBreakdown": [
    { "id": 3, "title": "Curso de Angular", "status": "PUBLISHED",
      "enrolled": 40, "completed": 12, "cancelled": 2, "completionRate": 32, "averageScore": 78 }
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
- **`series` (para la gráfica):** inscripciones y finalizaciones por fecha.
  - `bucket` es `day` (`date: "2026-10-06"`) en `7d`, `30d` y `90d`, y `month` (`date: "2026-10"`) en `1y` y `all`.
  - Los días o meses sin movimiento vienen con ceros, así que se puede graficar directo sin rellenar huecos.
  - Las finalizaciones se ubican por la fecha en que se completó el curso, no por la de inscripción.
- **`courseBreakdown[].averageScore`:** `null` si el curso aún no tiene intentos calificados.

## Todavía no disponible

Las **ganancias** y la **calificación promedio** (reseñas) no están aquí porque dependen de los módulos de pagos y de
reseñas, que aún no existen. Cuando se construyan se agregan `earnings` y `rating` a esta misma respuesta.
