/**
 * Validación y «pasarela» SIMULADA de tarjetas. No se cobra nada: sirve para probar el flujo de compra.
 *
 * Tarjetas de prueba:
 * - 4242 4242 4242 4242 (Visa) y 5555 5555 5555 4444 (Mastercard): aprobadas.
 * - 4000 0000 0000 0002: rechazada por fondos insuficientes.
 * - 4000 0000 0000 0069: rechazada por tarjeta vencida.
 * - 4000 0000 0000 0119: rechazada por error de procesamiento.
 * Cualquier otro número válido (algoritmo de Luhn) se aprueba.
 */
export type CardBrand = 'VISA' | 'MASTERCARD' | 'AMEX' | 'OTRA';

/** Quita espacios y guiones: «4242 4242-4242 4242» → «4242424242424242». */
export const digitsOf = (value: string): string => value.replace(/[\s-]/g, '');

/** Algoritmo de Luhn: detecta un número de tarjeta mal digitado. */
export function luhnValid(number: string): boolean {
  if (!/^\d{12,19}$/.test(number)) {
    return false;
  }

  let sum = 0;

  for (let i = 0; i < number.length; i++) {
    let digit = Number(number[number.length - 1 - i]);

    if (i % 2 === 1) {
      digit *= 2;

      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
  }

  return sum % 10 === 0;
}

export function brandOf(number: string): CardBrand {
  if (/^4/.test(number)) return 'VISA';
  if (/^(5[1-5]|2(2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/.test(number)) return 'MASTERCARD';
  if (/^3[47]/.test(number)) return 'AMEX';

  return 'OTRA';
}

/** Año de dos cifras (28) o de cuatro (2028) al año completo. */
export const fullYear = (year: number): number => (year < 100 ? 2000 + year : year);

/** ¿Venció? Una tarjeta vale hasta el último día del mes de vencimiento. */
export function isExpired(month: number, year: number, now = new Date()): boolean {
  const end = new Date(Date.UTC(fullYear(year), month, 1)); // primer día del mes siguiente

  return end.getTime() <= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

/** El código de seguridad tiene 4 cifras en American Express y 3 en las demás. */
export const cvvValid = (cvv: string, brand: CardBrand): boolean =>
  brand === 'AMEX' ? /^\d{4}$/.test(cvv) : /^\d{3}$/.test(cvv);

export interface GatewayResult {
  approved: boolean;
  reason?: string;
}

const DECLINES: Record<string, string> = {
  '4000000000000002': 'Fondos insuficientes',
  '4000000000000069': 'La tarjeta está vencida',
  '4000000000000119': 'Error de procesamiento: inténtalo de nuevo',
};

/** La «pasarela»: decide por el número de la tarjeta (ver las tarjetas de prueba arriba). */
export function simulateGateway(number: string): GatewayResult {
  const reason = DECLINES[number];

  return reason ? { approved: false, reason } : { approved: true };
}

/** Código del comprobante: «PAY-7F3K-9QXA» (sin letras que se confunden con números). */
export function newReference(random: (max: number) => number = (max) => Math.floor(Math.random() * max)): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (n: number) => Array.from({ length: n }, () => chars[random(chars.length)]).join('');

  return `PAY-${pick(4)}-${pick(4)}`;
}
