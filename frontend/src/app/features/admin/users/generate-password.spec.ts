import { describe, expect, it } from 'vitest';

import { generatePassword } from './users-page';

describe('generatePassword', () => {
  it('tiene 12 caracteres más un símbolo, así cumple el mínimo de 8 del servidor', () => {
    const password = generatePassword();

    expect(password).toHaveLength(13);
    expect(password.endsWith('*')).toBe(true);
  });

  it('no usa letras que se confunden con números (0, O, 1, l, I)', () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePassword().slice(0, -1)).not.toMatch(/[0O1lI]/);
    }
  });

  it('cada una es distinta', () => {
    const passwords = new Set(Array.from({ length: 30 }, () => generatePassword()));

    expect(passwords.size).toBe(30);
  });
});
