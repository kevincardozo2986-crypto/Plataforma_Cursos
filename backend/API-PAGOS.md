# API de pagos (simulados)

> **No hay pasarela real.** El pago es una simulación para probar el flujo de compra: no se mueve dinero.
> Nunca se guarda el número completo de la tarjeta ni el código de seguridad (solo marca y últimos 4 dígitos).

## Reglas

- Un curso con `price > 0` **solo admite inscripción con un pago aprobado**. `POST /courses/:id/enroll` responde `402` si no lo hay.
- Antes de cobrar se comprueba que la persona pueda entrar (curso publicado, no inscrita ya, contraseña, cupo, requisitos): no se cobra algo que luego no se puede entregar.
- El importe lo decide el servidor (el `price` del curso); un campo `amount` en el cuerpo da `400`.
- Si ya había un pago aprobado (p. ej. canceló su inscripción y vuelve), se re-inscribe **sin cobrar de nuevo** (`alreadyPaid: true`).

## Endpoints

### `POST /courses/:courseId/checkout` (estudiantes)

```json
{ "cardHolder": "Ana Ruiz", "cardNumber": "4242 4242 4242 4242", "expMonth": 12, "expYear": 30, "cvv": "123", "password": "solo si el curso la pide" }
```

- `400`: número que no pasa Luhn, tarjeta vencida, CVV inválido (4 dígitos en Amex), curso gratis.
- `401/403`: sin sesión / no es estudiante. `409`: ya inscrito. `404`: curso no publicado.
- `200/201`: `{ status: "APPROVED" | "DECLINED", alreadyPaid, enrolled, reason?, payment }`. Un rechazo **no** inscribe y deja su comprobante.

`payment`: `{ id, reference ("PAY-XXXX-XXXX"), status, amount, currency, cardBrand, cardLast4, payerName, failureReason, createdAt, course: { id, title } }`.

### `GET /payments/mine`

Mis comprobantes (aprobados y rechazados), los más recientes primero (máx. 100).

## Tarjetas de prueba

| Número | Resultado |
| --- | --- |
| `4242 4242 4242 4242` (Visa), `5555 5555 5555 4444` (Mastercard) | Aprobada |
| `4000 0000 0000 0002` | Rechazada: fondos insuficientes |
| `4000 0000 0000 0069` | Rechazada: tarjeta vencida |
| `4000 0000 0000 0119` | Rechazada: error de procesamiento |
| Cualquier otro número válido (Luhn) | Aprobada |

Vencimiento futuro (ej. `12/30`) y CVV de 3 dígitos (4 en American Express).

## Modelo

`Payment` (`payments`): `reference` único, `status` (`APPROVED|DECLINED`), `amount`, `currency` (`COP`), `cardBrand`, `cardLast4`, `payerName`, `failureReason`, `userId`, `courseId`, `createdAt`. Migración `20261023150000_simulated_payments`.

## Frontend

En el detalle del curso, un curso de pago muestra «Comprar curso · $X» y abre un formulario (tarjeta animada, número con espacios, vencimiento `MM/AA`, tarjetas de prueba con un clic, estado «Procesando…», comprobante o motivo del rechazo).
