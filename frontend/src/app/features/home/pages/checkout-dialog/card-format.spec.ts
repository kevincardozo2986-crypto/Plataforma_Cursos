import { describe, expect, it } from 'vitest';

import { brandOf, expiryError, formatCardNumber, formatExpiry, luhnValid } from './card-format';

describe('card-format', () => {
  it('agrupa el número de la tarjeta', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('42a42')).toBe('4242');
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005');
  });

  it('reconoce la marca', () => {
    expect(brandOf('4242')).toBe('VISA');
    expect(brandOf('5555')).toBe('MASTERCARD');
    expect(brandOf('3782')).toBe('AMEX');
    expect(brandOf('9')).toBe('OTRA');
  });

  it('da formato al vencimiento', () => {
    expect(formatExpiry('1228')).toBe('12/28');
    expect(formatExpiry('3')).toBe('03');
    expect(formatExpiry('12')).toBe('12');
  });

  it('valida con Luhn', () => {
    expect(luhnValid('4242424242424242')).toBe(true);
    expect(luhnValid('4242424242424241')).toBe(false);
  });

  it('valida el vencimiento', () => {
    const now = new Date(2026, 9, 23);
    expect(expiryError('10/26', now)).toBe('');
    expect(expiryError('09/26', now)).toMatch(/vencida/);
    expect(expiryError('13/30', now)).toMatch(/mes/);
    expect(expiryError('1/3', now)).toMatch(/MM\/AA/);
  });
});
