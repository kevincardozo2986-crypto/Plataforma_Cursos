# Certificados

Un docente diseña **plantillas**, la **asigna a un curso**, y cuando un estudiante termina todas las lecciones el sistema le emite
su certificado automáticamente, con un código para verificarlo y un PDF descargable.

Flujo del docente (el "Create Your Certificate In 3 Steps" del PDF de análisis):
1. **Diseñar** la plantilla (`POST /certificate-templates`) y verla (`GET /certificate-templates/:id/preview`).
2. **Asignarla** a un curso: `PATCH /courses/:id` con `{ "certificateTemplateId": 12 }` (en el paso "Additional" del asistente).
3. Listo: se emite solo. Quienes **ya habían terminado** el curso reciben el suyo en ese momento.

## 1. Plantillas (docente o admin)

| Ruta | Para qué |
|---|---|
| `GET /certificate-templates` | Mis plantillas, con `_count.courses` (cuántos cursos la usan). Un admin ve todas |
| `POST /certificate-templates` | Crea |
| `GET /certificate-templates/:id` | Una plantilla |
| `PATCH /certificate-templates/:id` | Edita |
| `DELETE /certificate-templates/:id` | Borra. `409` si algún curso la usa (hay que quitársela primero) |
| `GET /certificate-templates/:id/preview` | **PDF de ejemplo** con la marca "VISTA PREVIA" |

```json
{
  "name": "Mi plantilla",
  "title": "Certificado de finalización",
  "body": "Por haber completado satisfactoriamente el curso «{{course}}», impartido por {{instructor}}, el {{date}}.",
  "accentColor": "#1F3A8A",
  "layout": "CLASSIC"
}
```

- Solo `name` es obligatorio; lo demás tiene valores por defecto (los de arriba).
- `layout`: `CLASSIC` (doble borde, centrado) o `MODERN` (barra de color a la izquierda). `accentColor`: hexadecimal de 6 dígitos.
- **Marcadores** en `body`: `{{student}}` `{{course}}` `{{date}}` `{{hours}}` `{{instructor}}`. Uno mal escrito (`{{estudiante}}`) se
  rechaza con un `400` que lista los válidos. `{{hours}}` sale como "20 horas" (de la duración del curso) y queda vacío si el curso no la tiene.
- El nombre del estudiante y el del curso se dibujan siempre, grandes; el texto va debajo. Los nombres muy largos se achican solos.
- Cada docente solo ve y usa **sus** plantillas (`403` con las de otro). Máximo 50 por docente.
- La vista previa trae **la firma y el nombre de quien la mira**. Requiere token: pedirla con `HttpClient` como `blob`.

## 2. Certificados emitidos

| Ruta | Quién | Para qué |
|---|---|---|
| `GET /certificates/mine` | cualquier usuario | Mis certificados |
| `GET /certificates/:id/pdf` | dueño, docente del curso, admin | Descarga el PDF (requiere token, como `blob`) |
| `GET /certificates/verify/:code` | **público, sin sesión** | Comprueba un certificado |
| `GET /certificates?courseId=&status=&limit=&offset=` | docente, admin | Certificados emitidos en mis cursos |
| `PATCH /certificates/:id/revoke` | docente del curso, admin | Anula un certificado |

```json
// GET /certificates/mine
[ { "id": 2, "code": "CC-MHES-VSEG-CWYR", "status": "VALID", "courseId": 40,
    "courseTitle": "Curso de Angular", "instructorName": "Dra. Laura Gómez", "issuedAt": "2026-10-09T16:33:48.812Z" } ]

// GET /certificates/verify/CC-MHES-VSEG-CWYR   (sin sesión)
{ "valid": true, "status": "VALID", "revokedAt": null, "code": "CC-MHES-VSEG-CWYR",
  "studentName": "Ana Ruiz", "courseTitle": "Curso de Angular", "courseMinutes": 600,
  "instructorName": "Dra. Laura Gómez", "issuedAt": "…" }
```

- **Cuándo se emite:** al marcar la última lección del curso (y, retroactivamente, al asignar la plantilla a un curso que ya
  tenía estudiantes que lo terminaron). Se emite **una vez** por estudiante y curso; completar de nuevo no duplica nada.
  Al estudiante le llega la notificación `CERTIFICATE_ISSUED` (`courseId`, `refId` = id del certificado).
- **Copia fija:** el certificado guarda el nombre, el curso, la firma y el diseño **tal como estaban al emitirlo**. Si luego se
  renombra el curso o se edita o borra la plantilla, los certificados ya emitidos **no cambian**.
- **Firma:** la del autor del curso (su `signatureUrl` del perfil, ver `API-PERFIL.md`) y su nombre público. Sin firma, el PDF sale con
  la línea y el nombre.
- **Código:** `CC-XXXX-XXXX-XXXX` (sin 0, O, 1, I, L). La verificación acepta minúsculas. Un código inexistente o mal formado responde `404`.
- **Revocar:** el certificado sigue existiendo pero `verify` responde `valid: false` / `status: "REVOKED"`. Su dueño ya no puede
  descargarlo (`403`); el docente lo ve con la marca "REVOCADO".
- **Descargas:** si no eres el dueño ni gestionas el curso, responde `404` (como si no existiera). El PDF llega como adjunto
  (`application/pdf`, A4 horizontal).
- El PDF incluye un enlace de verificación: `APP_URL/verificar/<código>` (`APP_URL` en el `.env`; por defecto `http://localhost:4200`).
  **El frontend debe tener esa ruta pública** `/verificar/:code` que llame a `GET /certificates/verify/:code`.

## 3. En el curso

- `PATCH /courses/:id` acepta `certificateTemplateId` (id de **tu** plantilla; `null` quita el certificado del curso).
  Devuelve además `certificatesIssued`: cuántos certificados se emitieron en ese momento a quienes ya habían terminado.
- `GET /courses/manage/:id` trae `certificateTemplate: { id, name }` (o `null`).
