import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { UpdateProfileDto } from './profile.dto.js';

const check = async (plain: object) => (await validate(plainToInstance(UpdateProfileDto, plain))).length;

describe('foto de perfil (DTO)', () => {
  it('acepta una imagen subida a la plataforma', async () => {
    expect(await check({ avatarUrl: '/api/uploads/a1b2c3d4e5f60718293a4b5c6d7e8f90.png' })).toBe(0);
  });

  it('un texto vacío o null la quita', async () => {
    expect(plainToInstance(UpdateProfileDto, { avatarUrl: '' }).avatarUrl).toBeNull();
    expect(await check({ avatarUrl: null })).toBe(0);
  });

  it.each([
    'https://otra-web.com/foto.png',
    '/api/uploads/corta.png',
    '/api/uploads/a1b2c3d4e5f60718293a4b5c6d7e8f90.exe',
    'javascript:alert(1)',
  ])('rechaza %s', async (avatarUrl) => {
    expect(await check({ avatarUrl })).toBeGreaterThan(0);
  });
});
