import { validate } from 'class-validator';
import { IsOptional } from 'class-validator';

import { IsMediaUrl, isMediaUrl } from './is-media-url.js';

const HEX = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('isMediaUrl', () => {
  it.each([
    'https://example.com/video.mp4',
    'http://cdn.example.com/a/b.png',
    `/api/uploads/${HEX}.mp4`,
    `/api/uploads/${HEX}.webp`,
  ])('acepta %s', (url) => {
    expect(isMediaUrl(url)).toBe(true);
  });

  it.each([
    'no-es-url',
    'ftp://example.com/video.mp4',
    '/api/uploads/../../etc/passwd',
    `/api/uploads/${HEX}.exe`,
    '/api/uploads/corto.mp4',
    `/otra-ruta/${HEX}.mp4`,
    '',
    null,
    42,
  ])('rechaza %s', (url) => {
    expect(isMediaUrl(url)).toBe(false);
  });
});

describe('@IsMediaUrl', () => {
  class Dto {
    @IsOptional()
    @IsMediaUrl('El video debe ser una URL válida o un archivo subido')
    videoUrl?: string;
  }

  const check = async (videoUrl?: string) => {
    const dto = new Dto();
    dto.videoUrl = videoUrl;

    return validate(dto);
  };

  it('deja pasar una URL externa y un archivo subido', async () => {
    expect(await check('https://example.com/v.mp4')).toHaveLength(0);
    expect(await check(`/api/uploads/${HEX}.mp4`)).toHaveLength(0);
  });

  it('permite omitirlo (campo opcional)', async () => {
    expect(await check(undefined)).toHaveLength(0);
  });

  it('rechaza un valor inválido con el mensaje indicado', async () => {
    const errors = await check('cualquier-cosa');

    expect(errors).toHaveLength(1);
    expect(Object.values(errors[0].constraints ?? {})).toContain(
      'El video debe ser una URL válida o un archivo subido',
    );
  });
});
