# API del administrador

Todas las rutas son de `/admin/...` y **solo** las puede usar un administrador (un docente o estudiante recibe `403`; sin sesión, `401`).
Nunca devuelven contraseñas ni datos de sesión.

| Ruta | Para qué |
|---|---|
| `GET /admin/overview` | Cifras de toda la plataforma y lo más reciente |
| `GET /admin/users?q=&role=&status=&limit=&offset=` | Cuentas (busca en nombre, apellido, correo o documento) |
| `POST /admin/users` | Crea una cuenta con el rol que se elija |
| `PATCH /admin/users/:id` | Cambia el rol o el estado de otra cuenta |
| `GET /admin/courses?q=&status=&teacherId=&limit=&offset=` | Todos los cursos, con su autor y sus conteos |

Las **categorías** se administran con `/categories` (crear y editar: docente o admin; **borrar: solo admin**; sus cursos quedan sin categoría). Para
cambiar el estado de un curso (publicar, archivar, pasar a borrador) se usa `PATCH /courses/:id/status`, que el administrador puede en cualquier curso.

## Resumen

```json
{
  "users": { "total": 120, "STUDENT": 100, "TEACHER": 18, "ADMIN": 2, "inactive": 4, "newLast30Days": 15 },
  "courses": { "total": 30, "DRAFT": 8, "PUBLISHED": 20, "ARCHIVED": 2 },
  "enrollments": { "total": 410, "completed": 96, "completionRate": 23 },
  "certificates": { "valid": 88 },
  "recentUsers": [ { "id": 9, "firstName": "Luis", "role": "TEACHER", "…": "…" } ],
  "recentCourses": [ { "id": 3, "title": "Angular", "status": "PUBLISHED", "createdAt": "…", "teacher": "Laura Gómez" } ]
}
```

## Usuarios

Una cuenta: `{ id, firstName, lastName, email, document, phone, role, status, createdAt, avatarUrl, courses, enrollments, instructing }`
(`courses`: los que creó; `instructing`: aquellos donde es instructor). Paginado: `{ total, items }`, `limit` de 1 a 100 (25 por defecto).

**Crear** (`POST /admin/users`): `{ firstName, lastName, email, document, phone?, role, password }`. La contraseña (mínimo 8) es la **inicial**: se guarda cifrada
y la persona puede cambiarla; quien administra debe compartírsela. Correo o documento repetidos: `409`.

**Cambiar** (`PATCH /admin/users/:id`): `{ role?, status? }` (`STUDENT | TEACHER | ADMIN`, `ACTIVE | INACTIVE`).
- Los permisos cambian **al instante** (el rol se lee en cada petición).
- `status: "INACTIVE"` bloquea el acceso y **cierra todas sus sesiones abiertas** (suben su `sessionVersion`); `ACTIVE` lo devuelve (debe iniciar sesión de nuevo).
- Uno **no puede cambiar su propia cuenta** (`400`), y siempre debe quedar **al menos un administrador activo** (`400`).
- Cambiar a un docente a estudiante no toca sus cursos: siguen a su nombre.
