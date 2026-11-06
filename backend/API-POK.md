# Integración con POK (credenciales digitales)

[POK](https://docs.pok.tech) emite **credenciales digitales**. Cada curso entrega **un solo tipo de certificado**, a elección del docente:

| Vía | Qué recibe el estudiante |
| --- | --- |
| **Plataforma** (por defecto) | Certificado en PDF con la plantilla del docente y un código de verificación público. |
| **POK** | Una credencial digital emitida por POK con el diseño elegido. **No** recibe el PDF de la plataforma. |

Nunca se entregan los dos. La vía se fija **al emitir** cada certificado (`Certificate.provider`), así que cambiarla después no altera lo que ya recibieron los estudiantes.

## Emisión directa y silenciosa (por defecto)

Con la configuración por defecto (`saveAsDraft: false`, `skipAcceptance: true`, `skipEmissionEmail: true`) el estudiante **no depende de que nadie emita ni acepte nada**:

1. Al completar el curso se envía la credencial a POK (`POST /credential`, `202`).
2. POK la procesa y la deja `emitted` en unos segundos (verificado: ~6-10 s). El servidor consulta a POK cada 3 s hasta que emita (hasta ~18 s), sin esperar al webhook.
3. El estudiante ve su estado «Emitida» y el enlace **Ver en POK** (`viewUrl`, `https://v.pok.tech/r/<id>`) en el aula y en «Mis certificados». Al abrirlos, lo que siga «pendiente» se vuelve a consultar.
4. Si la red falla al enviar, se reintenta sola (hasta 2 veces; la llave de idempotencia evita duplicados).

No se envía ningún correo de POK. Con `0` créditos la credencial básica se emitió sin problema.

## Cómo funciona

```
El docente elige la vía del curso (asistente, paso «Adicional», o pantalla POK)
   · Plataforma → no hay fila en pok_course_templates
   · POK        → fila (courseId, diseño de POK) y se quita la plantilla de la plataforma

Estudiante completa el curso → CertificatesService.issueFor()
   ├─ vía Plataforma → certificado propio (PDF, código CC-XXXX-…). POK no se entera.
   └─ vía POK        → registro del certificado (provider = POK, pokTemplateId = el diseño)
                         └─► PokService.emit()  (segundo plano, nunca rompe nada)
                               └─► POST https://api.pok.tech/credential → 202 + id → pokStatus = PENDING
POK emite / el estudiante acepta → POST /pok/webhook (firmado) → EMITTED → ACCEPTED
```

- Si el curso eligió POK pero la clave de POK **no está configurada** al momento de emitir, el estudiante recibe el certificado de la plataforma (no se queda sin nada).
- La emisión en POK es **asíncrona**. Se usa una llave de idempotencia (`campus-<código>`): reintentar nunca duplica la credencial (POK responde 409 y se enlaza la existente).
- El código vive en el módulo `certificates` (`src/modules/certificates/pok/`) porque el estado se guarda en la tabla de certificados.
- Al elegir POK en un curso, quienes ya lo habían completado **sin certificado** reciben su credencial (`issued` en la respuesta). Quienes ya tenían el de la plataforma lo conservan.

## Configuración (`backend/.env`)

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `POK_API_KEY` | sí | API key (POK > ajustes de usuario > *Integrations*). **Secreta**: solo en el backend. Sin ella POK queda apagado y todo es de la plataforma. |
| `POK_EMITTER` | no | Quién emite, como aparece en la credencial. Por defecto `Campus Virtual`. |
| `POK_SAVE_AS_DRAFT` | no (`false`) | `true` = la credencial queda en **borrador** en POK (no se emite ni gasta créditos): úsalo solo para probar. |
| `POK_SKIP_EMISSION_EMAIL` | no (`true`) | `true` = POK **no** envía su correo al estudiante (la plataforma ya lo notifica). |
| `POK_SKIP_ACCEPTANCE` | no (`true`) | `true` = la credencial queda emitida **sin que el estudiante la acepte**; ve su enlace en la plataforma. |
| `POK_WEBHOOK_SIGNING_KEY` | para el webhook | «Clave de firma» del webhook (POK > Webhooks > ícono de llave). |
| `POK_WEBHOOK_SECRET` | alternativa | «Secreto compartido»; se usa solo si no hay clave de firma. |
| `POK_API_URL`, `POK_LANGUAGE` | no | Por defecto `https://api.pok.tech` y `es-AR`. |

> Los diseños de certificado **se crean en POK**, no en la plataforma (la API de POK solo permite listarlos). El diseño ya **no** es una variable del servidor: lo elige cada curso.

## Estados (`Certificate.pokStatus`, solo certificados de POK)

| Estado | Significado |
| --- | --- |
| `NONE` | No se envió (p. ej. POK estaba apagado al emitir). |
| `PENDING` | Enviado a POK; esperando emisión (o en borrador). |
| `EMITTED` | POK emitió la credencial. |
| `ACCEPTED` | El estudiante la aceptó. |
| `FAILED` | POK rechazó o no respondió; el motivo está en `pokError`. Se puede reintentar. |

Un estado **nunca retrocede**. Además se guardan `pokCredentialId`, `pokState` (estado crudo de POK), `pokUrl` (página pública, `https://v.pok.tech/r/<id>`) y `pokSyncedAt`. Los certificados de la plataforma tienen `pokStatus = NONE` y nunca se envían.

## Endpoints

### Pantalla POK del docente (`/teacher/pok`)
Docente o admin.

| Endpoint | Qué hace |
| --- | --- |
| `GET /pok/status` | `{ enabled }` y, si está activo, organización, créditos, modo (borrador/real) y si el webhook está configurado. |
| `GET /pok/templates` | Los diseños de la cuenta de POK: `[{ id, name, tags }]`. `502` si POK no responde. Solo se lee la primera página de resultados. |
| `GET /pok/templates/:templateId/preview?title=` | Cómo se ve la credencial con ese diseño: `{ url }` de una **imagen PNG que genera POK** (`POST /template/preview`) con el título del curso y un estudiante de ejemplo. Se guarda 10 minutos en memoria. `400` id inválido, `502` si POK no la genera. La usa la vista previa de la pantalla POK. |
| `GET /pok/courses` | Mis cursos (un admin ve todos) con `pokTemplateId` / `pokTemplateName` (null = vía Plataforma) y `unsent` (certificados de POK vigentes aún no enviados). |
| `PUT /pok/courses/:courseId/template` | `{ "pokTemplateId": "<id>" }` = el curso entrega la credencial de POK; `{ "pokTemplateId": null }` = vuelve al certificado de la plataforma. Comprueba contra POK que el diseño exista (`400` si no). Responde `issued` (credenciales emitidas a quienes ya habían terminado sin certificado). Quien no gestiona el curso recibe `403`. |
| `POST /pok/courses/:courseId/send-pending` | Envía a POK los certificados **de POK** del curso que no están allá (hasta 100 por vez). `{ total, sent, failed }`. Reenviar uno que POK ya tiene **no duplica**. |

La elección se guarda en `pok_course_templates` (una fila por curso). Cambiar de vía no toca los certificados ya emitidos.

### Lo que ve cada rol
- **Estudiante**: `GET /certificates/mine` y `GET /certificates/courses/:id/completion` incluyen `provider` (`PLATFORM`/`POK`), `pokStatus` y `pokUrl`. `completion.certificateProvider` informa la vía del curso **antes** de que exista el certificado. Con vía POK no hay PDF: `GET /certificates/:id/pdf` responde `400`.
- **Docente**: `GET /certificates` incluye `provider`, `pokStatus` y `pokError`. Los de POK no se pueden «Corregir» ni «Actualizar diseño» (`400`): ya se emitieron en POK.

### `POST /certificates/:id/pok/sync` (sesión)
Reintenta el envío (si falló o no se envió) o consulta el estado actual. Lo pide el dueño o quien gestiona el curso (otra persona recibe 404). `400` si POK está apagado o si el certificado es de la plataforma. Respuesta: `{ pokStatus, pokError, pokUrl }`.

### `POST /pok/webhook` (público, firmado)
Recibe los avisos de POK. Solo actúa sobre `credential-emitted` y `credential-accepted` de credenciales que **son de la plataforma**; el resto se ignora con `200` para que POK no los reenvíe.

Autenticación (se exige una; **sin ninguna configurada se rechaza todo**):
1. **Firma (recomendada):** cabeceras `X-Pok-Request-Timestamp` y `X-Pok-Signature` = HMAC SHA-512 (hex) de `"<timestamp>.<cuerpo>"` con la clave de firma. Se rechaza si el sello difiere más de 5 minutos.
2. **Secreto compartido:** `Authorization: Basic base64("pok:<secreto>")`.

`main.ts` arranca Nest con `rawBody: true` para poder comprobar la firma sobre el cuerpo sin modificar.

**Registrar el webhook en POK:** POK > ajustes > *Webhooks*, con la URL pública `https://<tu-dominio>/api/pok/webhook` (en desarrollo, un túnel como ngrok hacia `localhost:3000`). El ícono de check envía un mensaje de prueba.

## Pasar a producción (emitir de verdad)
1. Tener **créditos** en POK (`GET /organization/me` informa `availableCredits`). La credencial *básica* es gratuita; Blockchain Verify y NFT consumen créditos.
2. Poner `POK_SAVE_AS_DRAFT=false` (y `POK_SKIP_EMISSION_EMAIL` según se quiera que POK avise por correo).
3. Registrar el webhook y configurar `POK_WEBHOOK_SIGNING_KEY`.
4. Reiniciar la API.

## Pruebas
- `pok/pok-api.spec.ts`: configuración, cuerpo de la petición, estados, firma del webhook y cliente HTTP.
- `pok/pok.service.spec.ts`: emisión, reintento, permisos, webhook y que un fallo de POK **nunca** rompa el certificado; un certificado de la plataforma nunca se envía.
- `certificates.service.spec.ts` («una sola vía»): el origen se fija al emitir, el aviso al estudiante, y que los de POK no tienen PDF ni se corrigen.

## Documento del estudiante en la credencial

Además de `receiver.identification`, muchos diseños de POK tienen un **campo propio** («Documento Id», «Documento», «Cédula»…) que no se llena solo.
Al emitir, el backend lee los parámetros del diseño (`GET /template/{id}` → `customParameters: [{ id, label }]`) y manda el documento del estudiante en
`customization.template.customParameters` como un objeto `{ idDelParametro: "documento" }`, en cada parámetro cuya etiqueta sea de documento
(documento, cédula, identificación, c.c., dni). Los demás parámetros (p. ej. «Número de horas») no se tocan. Si POK no responde esa consulta, la emisión sigue sin ellos.
La vista previa usa un documento de ejemplo (1234567890) para mostrar dónde saldrá. Las credenciales ya emitidas no cambian.
