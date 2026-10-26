import { brandOf, cvvValid, digitsOf, fullYear, isExpired, luhnValid, newReference, simulateGateway } from './card.js';

describe('luhnValid', () => {
  it.each(['4242424242424242', '5555555555554444', '378282246310005', '4000000000000002'])('acepta %s', (n) => {
    expect(luhnValid(n)).toBe(true);
  });

  it.each(['4242424242424241', '1234567890123456', '123', 'abcd', '', '4242 4242 4242 4242'])('rechaza %j', (n) => {
    expect(luhnValid(n)).toBe(false);
  });
});

describe('digitsOf', () => {
  it('quita espacios y guiones', () => {
    expect(digitsOf('4242 4242-4242  4242')).toBe('4242424242424242');
  });
});

describe('brandOf', () => {
  it('reconoce Visa, Mastercard y American Express', () => {
    expect(brandOf('4242424242424242')).toBe('VISA');
    expect(brandOf('5555555555554444')).toBe('MASTERCARD');
    expect(brandOf('2223003122003222')).toBe('MASTERCARD');
    expect(brandOf('378282246310005')).toBe('AMEX');
    expect(brandOf('6011111111111117')).toBe('OTRA');
  });
});

describe('isExpired', () => {
  const now = new Date('2026-10-23T12:00:00Z');

  it('vale hasta el último día del mes de vencimiento', () => {
    expect(isExpired(10, 2026, now)).toBe(false);
    expect(isExpired(12, 2026, now)).toBe(false);
    expect(isExpired(9, 2026, now)).toBe(true);
    expect(isExpired(1, 2025, now)).toBe(true);
  });

  it('acepta el año con dos cifras', () => {
    expect(fullYear(28)).toBe(2028);
    expect(fullYear(2028)).toBe(2028);
    expect(isExpired(1, 28, now)).toBe(false);
    expect(isExpired(1, 25, now)).toBe(true);
  });

  it('el mes de vencimiento actual todavía sirve', () => {
    expect(isExpired(10, 26, now)).toBe(false);
  });
});

describe('cvvValid', () => {
  it('3 cifras (4 en American Express)', () => {
    expect(cvvValid('123', 'VISA')).toBe(true);
    expect(cvvValid('1234', 'VISA')).toBe(false);
    expect(cvvValid('1234', 'AMEX')).toBe(true);
    expect(cvvValid('123', 'AMEX')).toBe(false);
    expect(cvvValid('12a', 'VISA')).toBe(false);
  });
});

describe('simulateGateway', () => {
  it('aprueba cualquier número válido, salvo las tarjetas de prueba de rechazo', () => {
    expect(simulateGateway('4242424242424242')).toEqual({ approved: true });
    expect(simulateGateway('5555555555554444')).toEqual({ approved: true });
  });

  it('rechaza las tarjetas de prueba con su motivo', () => {
    expect(simulateGateway('4000000000000002')).toEqual({ approved: false, reason: 'Fondos insuficientes' });
    expect(simulateGateway('4000000000000069').approved).toBe(false);
    expect(simulateGateway('4000000000000119').reason).toMatch(/Error de procesamiento/);
  });
});

describe('newReference', () => {
  it('tiene el formato PAY-XXXX-XXXX y sin letras confusas', () => {
    for (let i = 0; i < 50; i++) {
      expect(newReference()).toMatch(/^PAY-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
  });
});
