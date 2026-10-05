import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

import { optimizeImage } from './image-optimizer.js';

describe('optimizeImage', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'img-'));
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  /** Algo parecido a una foto: degradados suaves con un poco de grano, guardada como JPG de calidad alta. */
  async function makePhoto(name: string, width: number, height: number) {
    const pixels = Buffer.alloc(width * height * 3);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        const grain = ((x * 7919 + y * 104729) % 17) - 8;

        pixels[i] = Math.max(0, Math.min(255, 60 + Math.round((x / width) * 150) + grain));
        pixels[i + 1] = Math.max(0, Math.min(255, 90 + Math.round((y / height) * 120) + grain));
        pixels[i + 2] = Math.max(0, Math.min(255, 180 - Math.round((x / width) * 90) + grain));
      }
    }

    const path = join(dir, name);
    await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toFile(path);

    return path;
  }

  it('reduce una imagen grande a WebP y pesa mucho menos', async () => {
    const input = await makePhoto('grande.jpg', 3000, 2000);
    const output = join(dir, 'grande.webp');

    const size = await optimizeImage(input, output, { maxWidth: 1600, quality: 80 });
    const meta = await sharp(output).metadata();

    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(1067); // conserva la proporción 3:2
    expect(size).toBe(statSync(output).size);
    expect(size).toBeLessThan(statSync(input).size / 3);
  });

  it('no agranda una imagen que ya es pequeña', async () => {
    const input = await makePhoto('chica.jpg', 400, 300);
    const output = join(dir, 'chica.webp');

    await optimizeImage(input, output, { maxWidth: 1600, quality: 80 });
    const meta = await sharp(output).metadata();

    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it('una calidad más baja da un archivo más ligero', async () => {
    const input = await makePhoto('calidad.jpg', 1200, 800);
    const alta = await optimizeImage(input, join(dir, 'alta.webp'), { maxWidth: 1600, quality: 90 });
    const baja = await optimizeImage(input, join(dir, 'baja.webp'), { maxWidth: 1600, quality: 40 });

    expect(baja).toBeLessThan(alta);
  });

  it('falla con un archivo que no es una imagen', async () => {
    const input = join(dir, 'falso.png');
    writeFileSync(input, 'esto no es una imagen');

    await expect(optimizeImage(input, join(dir, 'falso.webp'), { maxWidth: 1600, quality: 80 })).rejects.toThrow();
  });
});
