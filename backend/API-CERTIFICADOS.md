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
  "layout": "CLASSIC",
  "font": "playfair-display",
  "bodyFont": "lora",
  "backgroundUrl": "/api/uploads/9f2c….webp",
  "style": {
    "title": { "bold": false, "italic": true, "size": 120, "color": "#B91C1C" },
    "name": { "size": 130 },
    "body": { "italic": true },
    "showDocument": true
  }
}
```

- Solo `name` es obligatorio; lo demás tiene valores por defecto (los de arriba).
- `layout` (13 diseños; el último es `IMAGE`, ver «Plantilla con tu propia imagen»): `CLASSIC` (doble borde), `MODERN` (barra lateral), `ELEGANT` (papel crema con remates), `BOLD` (banda
  de color arriba), `MINIMAL`, `SEAL` (con sello y cinta), `GEOMETRIC` (triángulos), `SIDEBAR` (panel lateral con sello),
  `FRAME` (marco grueso), `DARK` (fondo oscuro), `WAVES` (olas) y `RIBBON` (cinta vertical). Por defecto `CLASSIC`.
- `font` y `bodyFont`: la tipografía del **título y el nombre** y la del **texto** (se pueden combinar: nombre en cursiva y texto en serif).
  Valen `"SANS"` (Helvetica, por defecto), `"SERIF"` (Times), la clave de una de la biblioteca (`"playfair-display"`, `"great-vibes"`…)
  o `"custom:<id>"` (una que subió el propio docente). Son independientes del diseño y del color. Ver «Tipografías» abajo.
- `style` (opcional): negrita, cursiva, tamaño y color de cada texto (`title`, `name`, `body`) y si se muestra la cédula (`showDocument`, por defecto sí).
  Todo es opcional y lo que falta toma el valor del diseño. Al editar, `style` **reemplaza** al anterior (`{}` lo restablece); si no se envía, se conserva.
  - `bold`: `true` fuerza la negrita, `false` la quita, ausente = **automática** (negrita en título y nombre si la tipografía tiene negrita de verdad; en el texto, no).
    Forzarla en una tipografía **sin** negrita (cursivas, propias) la dibuja con un trazo grueso (**negrita sintética**: relleno + contorno).
  - `italic`: cursiva sintética (se inclina el texto 0,2), también en tipografías que no traen cursiva.
  - `size`: porcentaje del tamaño normal, de 60 a 140. `color`: `#RRGGBB`.
  - `offsets`: **mover los textos**. Un objeto con cuatro bloques posibles —`title`, `recipient` («Se otorga a», nombre, cédula y línea), `body` (el texto) y `signature` (línea, nombre y firma)— y para cada uno `{ "x": 12, "y": -8 }`: cuánto se corrió desde su sitio, en **puntos de página** (A4 horizontal: 841,89 × 595,28; `x` positivo = a la derecha, `y` positivo = hacia abajo). Enteros de −400 a 400 (`x`) y de −300 a 300 (`y`); lo que está en 0 no se guarda. El texto sigue achicándose solo para no pasar de la firma (el límite se mueve con ella). El editor los cambia arrastrando en la vista previa, con las flechas del teclado o escribiendo los números.
  - Un nombre grande empuja hacia abajo la cédula, la línea y el texto. El texto se **achica solo** hasta quedar por encima de la firma (mínimo 9 pt), así que un texto largo o agrandado nunca se monta sobre ella.
  - Valores inválidos (`size: 500`, `color: "rojo"`, `bold: "si"`…) se rechazan con `400`.
- **Plantilla con tu propia imagen** (`layout: "IMAGE"` + `backgroundUrl`): el docente sube su diseño (hecho en Canva, Word, Photoshop…) con
  `POST /uploads/images` y se usa como fondo de la hoja completa; el texto se escribe encima, centrado. Es **obligatoria** con `IMAGE` (`400` si falta) y
  tiene que ser una imagen subida a la plataforma (una URL externa da `400`); con cualquier otro diseño no se guarda (se borra al cambiar de diseño).
  Mejor apaisada (A4 horizontal, 297 × 210 mm, p. ej. 3508 × 2480 px): se ajusta a la hoja recortando (`cover`). El texto va en el centro, con la firma abajo;
  `style.veil` (0–80, porcentaje) pone un **velo blanco** semitransparente detrás del texto para que se lea sobre imágenes recargadas, y los colores del
  texto se cambian con `style.title/name/body.color`. La imagen se guarda en el certificado al emitirlo (como el resto del diseño).
- `accentColor`: hexadecimal de 6 dígitos. Los diseños derivan de él sus tonos claros y oscuros (el `DARK` lo usa para el fondo).
- En el frontend, la geometría de cada diseño está duplicada para la vista previa (`certificate-art.ts`): si se cambia un diseño
  en `certificate-pdf.ts`, hay que cambiarlo también allá.
- **Marcadores** en `body`: `{{student}}` `{{course}}` `{{date}}` `{{hours}}` `{{instructor}}`. Uno mal escrito (`{{estudiante}}`) se
  rechaza con un `400` que lista los válidos. `{{hours}}` sale como "20 horas" (de la duración del curso) y queda vacío si el curso no la tiene.
- **Siempre se dibujan** el nombre del estudiante (grande) y, debajo, su **documento de identidad** («Documento de identidad: 1.234.567.890», con puntos de miles si es numérico). El texto va después. Los nombres muy largos se achican solos.
- **Solo si están en el texto** aparecen el curso, la fecha, la duración y el docente. Si una plantilla no incluye `{{course}}`, el certificado no dice de qué curso es (el editor lo avisa).
- El documento se guarda como copia fija en el certificado (`studentDocument`); los emitidos antes de que existiera no lo tienen y se imprimen sin esa línea. **No** se muestra en la verificación pública (`GET /certificates/verify/:code`): es un dato personal.
- Cada docente solo ve y usa **sus** plantillas (`403` con las de otro). Máximo 50 por docente.
- La vista previa trae **la firma y el nombre de quien la mira**. Requiere token: pedirla con `HttpClient` como `blob`.

## 2. Certificados emitidos

| Ruta | Quién | Para qué |
|---|---|---|
| `GET /certificates/mine` | cualquier usuario | Mis certificados |
| `GET /certificates/:id/pdf` | dueño, docente del curso, admin | Descarga el PDF (requiere token, como `blob`) |
| `GET /certificates/verify/:code` | **público, sin sesión** | Comprueba un certificado |
| `GET /certificates?courseId=&status=&limit=&offset=` | docente, admin | Certificados emitidos en mis cursos |
| `PATCH /certificates/:id` | docente del curso, admin | **Corrige** el nombre o el documento del estudiante |
| `POST /certificates/:id/refresh` | docente del curso, admin | **Actualiza** el diseño con el de la plantilla actual del curso |
| `PATCH /certificates/:id/revoke` | docente del curso, admin | Anula un certificado |

- **Corregir** (`PATCH /certificates/:id`, cuerpo `{ "studentName"?: "...", "studentDocument"?: "..." }`): para errores de digitación. Nombre de 2 a 120
  caracteres y documento de 4 a 30; un documento vacío (`""`) o `null` lo quita del certificado. Sin ninguno de los dos, `400`. El **código y la fecha no cambian**,
  así que el enlace de verificación sigue valiendo (y ya muestra el nombre corregido). Otro docente o un estudiante reciben `403`.
- **Actualizar diseño** (`POST /certificates/:id/refresh`, sin cuerpo): un certificado guarda una **copia fija** del diseño con el que se emitió, así que mejorar la
  plantilla no cambia los ya emitidos. Este endpoint vuelve a copiar la plantilla actual del curso (textos, diseño, color, tipografías, estilo), el título y la duración
  del curso y el nombre y la firma del docente. **No** toca al estudiante, el código ni la fecha. `400` si el curso ya no tiene plantilla; `403` sin permiso.
- La lista del docente (`GET /certificates`) incluye `studentDocument` para poder revisarlo antes de corregir.

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
- **Copia fija:** el certificado guarda el nombre, el curso, la firma y el diseño (con su `layout` y `font`) **tal como estaban al emitirlo**. Los emitidos antes de que existiera `font` se dibujan con `SANS`. Si luego se
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

## 4. Tipografías

Cualquier tipografía: una biblioteca de **28** (más Helvetica y Times del PDF) y las que suba cada docente. Todas se **incrustan en el PDF**,
así que el certificado se ve igual en cualquier computador.

| Ruta | Quién | Para qué |
|---|---|---|
| `GET /certificate-fonts` | docente, admin | Catálogo: `standard`, `library` y `custom` (solo las propias), cada una con `key`, `label`, `category`, `hasBold` y `regularUrl`/`boldUrl` |
| `GET /certificate-fonts/files/:name` | **público** | Archivo de una tipografía de la biblioteca (caché de un año; solo sirve los del manifiesto) |
| `POST /certificate-fonts/custom` | docente, admin | Sube una propia (`multipart`, campo `file`, opcional `name`) |
| `GET /certificate-fonts/custom/:id/file` | su dueño, admin | El archivo de una propia (para la vista previa; pide sesión) |
| `DELETE /certificate-fonts/custom/:id` | su dueño, admin | La borra |

- **Biblioteca** (`backend/assets/certificate-fonts/`, con `manifest.json` y `LICENSES.txt`): Sans (Anton, Bebas Neue, Lato, Montserrat, Nunito, Open Sans,
  Oswald, Poppins, Raleway, Roboto), Serif (Cinzel, Cormorant Garamond, EB Garamond, Libre Baskerville, Lora, Merriweather, Playfair Display),
  Cursivas (Allura, Dancing Script, Great Vibes, Pacifico, Parisienne, Satisfy) y Títulos (Abril Fatface, Alfa Slab One, Cinzel Decorative, Lobster,
  Yeseva One). Todas con licencia SIL OFL (libres para incrustar y redistribuir) y comprobadas: dibujan todas las letras del español, «», ¿ y ¡.
  Se leen desde `process.cwd()/assets/certificate-fonts`; se puede cambiar la carpeta con la variable `FONTS_DIR`.
- **Propias:** `.ttf`, `.otf`, `.woff` o `.woff2`, hasta 2 MB, máximo 20 por docente. El formato se comprueba por el contenido (no por la extensión),
  el archivo se abre de verdad (uno dañado se rechaza) y debe dibujar todas las letras del español (si le falta la `ñ` o una tilde, se rechaza
  diciendo cuáles). Se guardan en `uploads/.fonts/` con nombre aleatorio y **solo las usa su dueño**.
- **Borrado protegido:** no se puede borrar una propia que use una plantilla (`409`) ni una que esté en un certificado ya emitido (`409`), porque se
  necesita para volver a generarlo. Si aun así faltara, el PDF se genera con Helvetica en vez de fallar.
- Si una tipografía **no tiene negrita** (`hasBold: false`: las cursivas y las propias), el título usa la normal; la vista previa tampoco la falsea.
- **Certificados antiguos:** los emitidos con una sola tipografía (`font` sin `bodyFont`) usan esa misma para todo; los que no traen ninguna, Helvetica.
- **Frontend:** `app-font-picker` (lista con cada nombre en su letra y subida de la propia) y `FontLoader` (registra las tipografías en el navegador con
  `FontFace`; las propias se bajan con el token). La vista previa mide el texto con la tipografía real, igual que el PDF, para achicar nombres largos.
