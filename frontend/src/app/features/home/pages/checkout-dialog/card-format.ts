export type CardBrand = 'VISA' | 'MASTERCARD' | 'AMEX' | 'OTRA';

export const BRAND_LABEL: Record<string, string> = {
  VISA: 'Visa',
  MASTERCARD: 'Mastercard',
  AMEX: 'American Express',
  OTRA: 'Tarjeta',
};

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

export function brandOf(digits: string): CardBrand {
  if (/^4/.test(digits)) return 'VISA';
  if (/^(5[1-5]|2(2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/.test(digits)) return 'MASTERCARD';
  if (/^3[47]/.test(digits)) return 'AMEX';
  return 'OTRA';
}

/** Escribe el número con espacios mientras se digita: «4242 4242 4242 4242» (Amex: 4-6-5). */
export function formatCardNumber(value: string): string {
  const digits = onlyDigits(value);
  if (brandOf(digits) === 'AMEX') {
    const d = digits.slice(0, 15);
    return [d.slice(0, 4), d.slice(4, 10), d.slice(10)].filter(Boolean).join(' ');
  }
  return (digits.slice(0, 19).match(/.{1,4}/g) ?? []).join(' ');
}

/** «1228» → «12/28»; el mes se corrige si empieza por 2-9 («2» → «02/»). */
export function formatExpiry(value: string): string {
  let digits = onlyDigits(value).slice(0, 4);
  if (digits.length === 1 && Number(digits) > 1) digits = '0' + digits;
  return digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
}

export function luhnValid(digits: string): boolean {
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Devuelve el mensaje de error del vencimiento «MM/AA», o '' si sirve. */
export function expiryError(value: string, now = new Date()): string {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return 'Escribe el vencimiento como MM/AA';
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return 'El mes debe ser de 01 a 12';
  if (year * 12 + month - 1 < now.getFullYear() * 12 + now.getMonth()) return 'La tarjeta está vencida';
  return '';
}
