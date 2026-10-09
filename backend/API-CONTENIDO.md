# Acceso al contenido y liberación gradual

## 1. Quién puede abrir el contenido (cambio importante)

Antes, cualquier usuario con sesión podía leer las lecciones de un curso publicado. Ahora el **contenido** (lecciones, recursos,
preguntas de quizzes, instrucciones de tareas) solo lo abren:

| Quién | Acceso |
|---|---|
| El docente del curso y los admin | Siempre, aunque un módulo esté cerrado (vista previa) |
| Un estudiante **inscrito** | Sí, salvo los módulos que sigan cerrados por la liberación gradual (sección 2) |
| Alguien **sin inscripción** | Solo si el curso tiene `publicContent: true` **y** no usa liberación gradual |

Una inscripción **cancelada** cuenta como no inscrito. Los **títulos** (el temario público `GET /courses/:id`) siguen visibles
para todos: lo que se protege es el contenido.

Rutas que aplican la regla: `GET /modules/:id/lessons`, `GET /lessons/:id`, `GET /lessons/:id/resources`,
`GET /evaluations/:id`, `POST /evaluations/:id/attempts`, `GET /modules/:id/assignments`, `GET /assignments/:id`,
`PUT /assignments/:id/submission` y `POST /lessons/:id/complete`.

### La respuesta `403`

Cuando se niega el acceso, el cuerpo explica por qué, para mostrarlo tal cual o armar una pantalla de "bloqueado":

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Este contenido se desbloquea el 14 de octubre de 2026",
  "locked": {
    "reason": "DATE",
    "unlocksAt": "2026-10-14T17:00:00.000Z",
    "requiredModules": []
  }
}
```

| `reason` | Significa | Datos |
|---|---|---|
| `NOT_ENROLLED` | No está inscrito | |
| `DATE` | El módulo se abre en una fecha | `unlocksAt` |
| `DAYS` | Se abre N días después de inscribirse | `unlocksAt` (calculado para ese alumno) |
| `PREVIOUS` | Hay que terminar el módulo anterior | `requiredModules: [{ id, title }]` |
| `PREREQUISITES` | Hay que terminar otros módulos | `requiredModules` (solo los que faltan) |

Un módulo cuenta como **terminado** cuando el estudiante marcó todas sus lecciones como completadas (uno sin lecciones cuenta
como terminado). Los quizzes y tareas no influyen.

## 2. Liberación gradual (*content drip*)

### Configurarla (docente)

El **modo** se elige por curso, con `PATCH /courses/:id`:

```json
{ "dripType": "SEQUENTIAL" }
```

| `dripType` | Efecto |
|---|---|
| `NONE` (por defecto) | Todo abierto |
| `BY_DATE` | Cada módulo se abre en su fecha `unlockAt` |
| `AFTER_DAYS` | Cada módulo se abre `unlockAfterDays` días **después de la inscripción de cada alumno** |
| `SEQUENTIAL` | El primer módulo está abierto; cada uno de los demás, al terminar el anterior (por `position`) |
| `PREREQUISITES` | Un módulo se abre al terminar todos los de su lista `requiresModuleIds` |

Los **ajustes de cada módulo** van en `POST /courses/:courseId/modules` y `PATCH /modules/:id`. Solo cuenta el que corresponde
al modo activo; los demás se guardan pero no hacen nada (así se puede cambiar de modo sin perderlos). `SEQUENTIAL` no necesita ajustes.

```json
{
  "title": "Módulo 2",
  "unlockAt": "2026-11-01T08:00:00-05:00",
  "unlockAfterDays": 7,
  "requiresModuleIds": [12, 13]
}
```

- Un módulo sin ajuste en el modo activo queda **abierto**.
- `unlockAt`: ISO 8601. `unlockAfterDays`: entero de 0 a 3650 (0 = de inmediato). En el `PATCH`, `null` quita el ajuste.
- `requiresModuleIds` **reemplaza** la lista completa (`[]` la vacía). Deben ser módulos **del mismo curso**; no puede pedirse a sí
  mismo ni formar un **círculo** (A pide B y B pide A dejaría ambos cerrados para siempre): `400` con un mensaje claro.
- La vista del docente (`GET /courses/manage/:id`) trae `dripType` y, en cada módulo, `unlockAt`, `unlockAfterDays` y
  `requiresModuleIds`.

### Mostrar qué está abierto

`GET /courses/:courseId/modules/availability` (cualquier usuario con sesión)

```json
{
  "dripType": "SEQUENTIAL",
  "modules": [
    { "moduleId": 11, "locked": false, "reason": null, "unlocksAt": null, "requiredModules": [] },
    { "moduleId": 12, "locked": true, "reason": "PREVIOUS", "unlocksAt": null,
      "requiredModules": [ { "id": 11, "title": "Introducción" } ] }
  ]
}
```

Está calculado **para quien consulta**: cada estudiante ve el suyo (según su inscripción y su avance), y el docente lo ve
todo abierto. Úsalo para pintar candados en el temario sin pedir lección por lección.

## 3. Notas

- Quien **cambia el modo** a `NONE` abre todo de nuevo, aunque los módulos conserven sus ajustes.
- El avance cuenta por alumno: que un compañero termine un módulo no abre nada a los demás.
- Con liberación gradual, `publicContent` deja de abrir contenido a quien no está inscrito (si no, bastaría con no inscribirse
  para saltarse el calendario).
