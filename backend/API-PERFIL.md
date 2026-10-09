# Perfil y ajustes

Para cualquier usuario con sesión. Las rutas van con `Authorization: Bearer <token>`.

| Ruta | Para qué |
|---|---|
| `GET /profile` | Mi cuenta, perfil, preferencias y (si soy docente) estadísticas |
| `PATCH /profile` | Edita lo que se envíe; devuelve lo mismo que el `GET`, ya actualizado |
| `PATCH /profile/password` | Cambia la contraseña |
| `GET /teachers/:id` | Perfil **público** de un docente (sin sesión) |

## 1. `GET /profile`

```json
{
  "account": { "id": 2, "firstName": "Laura", "lastName": "Gómez", "email": "laura@campus.com",
               "phone": "3001234567", "role": "TEACHER", "createdAt": "2026-01-10T…" },
  "profile": {
    "occupation": "Ingeniera de software",
    "timezone": "America/Bogota",
    "publicName": "Dra. Laura Gómez",
    "bio": "Docente de programación…",
    "signatureUrl": "/api/uploads/9f2c….webp",
    "social": { "facebookUrl": null, "xUrl": null, "linkedinUrl": "https://linkedin.com/in/laura",
                "githubUrl": "https://github.com/laura", "websiteUrl": null }
  },
  "preferences": { "autoplayNext": true, "reduceMotion": false, "theme": "SYSTEM",
                   "fontSize": "MEDIUM", "highContrast": false, "colorFilter": "NONE" },
  "stats": { "courses": 4, "students": 120, "rating": { "average": 4.5, "count": 32 } }
}
```

- Mientras la persona no haya guardado nada, `profile` y `preferences` traen los **valores por defecto** (no hay que manejar "perfil vacío").
- `stats` solo existe para **docentes** (para los demás es `null`). Las **ganancias** se agregarán aquí cuando exista el módulo de pagos.
- Nunca se devuelve el hash de la contraseña ni el documento.

## 2. `PATCH /profile`

Todo es opcional; **lo que no se envía no se toca**. En los campos que se pueden borrar, `null` (o un texto vacío `""`) los quita.

| Grupo | Campos |
|---|---|
| **Cuenta** (ajustes → Account) | `firstName`, `lastName`, `phone`, `occupation`, `timezone` (IANA, p. ej. `America/Bogota`), `publicName`, `bio` (texto plano, hasta 2000), `signatureUrl` |
| **Redes** (Social) | `facebookUrl`, `xUrl`, `linkedinUrl`, `githubUrl`, `websiteUrl`: deben empezar con `http://` o `https://` |
| **Preferencias** | `autoplayNext`, `reduceMotion`, `highContrast` (booleanos); `theme`: `LIGHT` \| `DARK` \| `SYSTEM`; `fontSize`: `SMALL` \| `MEDIUM` \| `LARGE`; `colorFilter`: `NONE` \| `PROTANOPIA` \| `DEUTERANOPIA` \| `TRITANOPIA` \| `GRAYSCALE` |

- **Firma del docente** (`signatureUrl`, solo docentes y admin; un estudiante recibe `403`): se sube primero la imagen con
  `POST /uploads/images` y luego se guarda la URL que devuelve. Tiene que ser **una imagen subida a la plataforma**; una URL externa
  se rechaza (`400`). Recomendado: 700 × 430 px, fondo transparente (PNG). `null` la quita.
- Los **ajustes de accesibilidad y tema** (`theme`, `fontSize`, `highContrast`, `reduceMotion`, `colorFilter`, `autoplayNext`) los
  tiene cualquier usuario; el frontend los lee al iniciar sesión para aplicarlos.
- Los errores llegan como `400` con un mensaje en español (zona horaria inválida, URL sin protocolo, etc.).

## 3. `PATCH /profile/password`

```json
{ "currentPassword": "Campus2026*", "newPassword": "NuevaClave2026" }
```

`400` si la actual no coincide, si la nueva es igual a la actual o si tiene menos de 8 caracteres. Devuelve `{ "changed": true }`.
El correo no se cambia desde aquí. El **restablecimiento por correo** ("olvidé mi contraseña") no está hecho: necesita enviar correos.

## 4. `GET /teachers/:id` (público)

Para la sección "Sobre el docente" de la página del curso. Solo docentes activos (otro id responde `404`).

```json
{ "id": 2, "name": "Dra. Laura Gómez", "occupation": "Ingeniera de software", "bio": "…",
  "social": { "facebookUrl": null, "xUrl": null, "linkedinUrl": "…", "githubUrl": "…", "websiteUrl": null },
  "publishedCourses": 3 }
```

`name` es el nombre público si lo definió, y si no, nombre y apellido. **Nunca** incluye correo, teléfono ni documento.
