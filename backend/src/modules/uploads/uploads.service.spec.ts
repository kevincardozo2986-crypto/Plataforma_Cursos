import { BadRequestException } from '@nestjs/common';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

import type { FfmpegRunner } from './ffmpeg-runner.js';
import { ensureUploadDirs, incomingDir, privateDir, uploadsDir } from './upload-paths.js';
import { cleanFileName, type StoredFile, UploadsService } from './uploads.service.js';
import type { VideoOptimizerService } from './video-optimizer.service.js';

const ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('UploadsService', () => {
  let root: string;
  const previous = process.env.UPLOADS_DIR;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'uploads-'));
    process.env.UPLOADS_DIR = root;
    ensureUploadDirs();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    process.env.UPLOADS_DIR = previous;
  });

  function build(ffmpegAvailable: boolean) {
    const videos = { enqueue: vi.fn() };
    const runner = { isAvailable: vi.fn().mockResolvedValue(ffmpegAvailable) };
    const service = new UploadsService(
      runner as unknown as FfmpegRunner,
      videos as unknown as VideoOptimizerService,
    );

    return { service, videos };
  }

  /** Lo que multer dejaría en la carpeta interna. */
  function incoming(extension: string, original: string, content: Buffer): StoredFile {
    const filename = `${ID}.${extension}`;
    const path = join(incomingDir(), filename);
    writeFileSync(path, content);

    return { filename, path, size: content.length, originalname: original };
  }

  const mp4 = (size: number) =>
    Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(size - 12)]);

  /** Algo parecido a una foto: degradados con un poco de grano, como JPG de calidad alta. */
  async function bigPhoto() {
    const [width, height] = [2400, 1600];
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

    return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
  }

  describe('imágenes', () => {
    it('la deja como WebP más liviano, borra el original y devuelve el nuevo peso', async () => {
      const { service } = build(true);
      const content = await bigPhoto();

      const result = await service.finish(incoming('jpg', 'foto.jpg', content), 'image');

      expect(result.url).toBe(`/api/uploads/${ID}.webp`);
      expect(result.status).toBe('ready');
      expect(result.originalSize).toBe(content.length);
      expect(result.size).toBeLessThan(content.length / 3);
      expect(statSync(join(uploadsDir(), `${ID}.webp`)).size).toBe(result.size);
      expect(readdirSync(incomingDir())).toEqual([]);
    });

    it('rechaza una imagen corrupta y no deja archivos', async () => {
      const { service } = build(true);
      // Tiene la firma de PNG, pero el resto está dañado.
      const broken = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);

      await expect(service.finish(incoming('png', 'rota.png', broken), 'image')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(readdirSync(incomingDir())).toEqual([]);
      expect(existsSync(join(uploadsDir(), `${ID}.webp`))).toBe(false);
    });
  });

  describe('videos', () => {
    it('con ffmpeg: lo pone en cola y devuelve la dirección final (.mp4) como "procesando"', async () => {
      const { service, videos } = build(true);
      const file = incoming('mov', 'clase.mov', mp4(2048));

      const result = await service.finish(file, 'video');

      expect(result).toMatchObject({
        url: `/api/uploads/${ID}.mp4`,
        status: 'processing',
        optimized: true,
        originalSize: 2048,
      });
      expect(videos.enqueue).toHaveBeenCalledWith({
        id: ID,
        inputPath: file.path,
        inputExt: 'mov',
        inputSize: 2048,
      });
      // Mientras se procesa, el original NO está en la carpeta pública.
      expect(readdirSync(uploadsDir()).filter((name) => name.startsWith(ID))).toEqual([]);
    });

    it('sin ffmpeg: guarda el video tal cual para no fallar, y lo avisa', async () => {
      const { service, videos } = build(false);

      const result = await service.finish(incoming('mp4', 'clase.mp4', mp4(2048)), 'video');

      expect(result).toMatchObject({ url: `/api/uploads/${ID}.mp4`, status: 'ready', optimized: false });
      expect(videos.enqueue).not.toHaveBeenCalled();
      expect(statSync(join(uploadsDir(), `${ID}.mp4`)).size).toBe(2048);
    });

    it('un archivo disfrazado de video se rechaza y se borra', async () => {
      const { service, videos } = build(true);
      const fake = incoming('mp4', 'x.mp4', Buffer.from('MZ no soy un video, soy un programa disfrazado'));

      await expect(service.finish(fake, 'video')).rejects.toBeInstanceOf(BadRequestException);
      expect(videos.enqueue).not.toHaveBeenCalled();
      expect(readdirSync(incomingDir())).toEqual([]);
    });
  });

  describe('documentos privados', () => {
    const pdf = Buffer.from('%PDF-1.7\n' + 'contenido '.repeat(20));

    /** Lo que multer dejaría directamente en la carpeta privada. */
    function privateUpload(extension: string, original: string, content: Buffer): StoredFile {
      mkdirSync(privateDir(), { recursive: true });
      const filename = `${ID}.${extension}`;
      const path = join(privateDir(), filename);
      writeFileSync(path, content);

      return { filename, path, size: content.length, originalname: original };
    }

    it('guarda un PDF válido en la carpeta privada, con su ficha, y NO en la pública', async () => {
      const { service } = build(true);

      const result = await service.finishDocument(privateUpload('pdf', 'tarea.pdf', pdf), 5);

      expect(result).toEqual({ name: `${ID}.pdf`, originalName: 'tarea.pdf', size: pdf.length, uploadedBy: 5 });
      expect(existsSync(join(privateDir(), `${ID}.pdf`))).toBe(true);
      expect(existsSync(join(uploadsDir(), `${ID}.pdf`))).toBe(false);
      await expect(service.privateInfo(`${ID}.pdf`)).resolves.toMatchObject({ uploadedBy: 5 });
      await expect(service.resolve(`${ID}.pdf`)).resolves.toBeNull(); // la ruta pública no lo entrega
    });

    it('rechaza y borra un archivo que no es lo que dice su extensión', async () => {
      const { service } = build(true);
      const fake = privateUpload('pdf', 'virus.pdf', Buffer.from('MZ esto es un programa disfrazado de pdf'));

      await expect(service.finishDocument(fake, 5)).rejects.toBeInstanceOf(BadRequestException);
      expect(existsSync(join(privateDir(), `${ID}.pdf`))).toBe(false);
      await expect(service.privateInfo(`${ID}.pdf`)).resolves.toBeNull();
    });

    it('exige que venga un archivo', async () => {
      await expect(build(true).service.finishDocument(undefined, 5)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('solo resuelve nombres válidos y borra archivo y ficha juntos', async () => {
      const { service } = build(true);
      await service.finishDocument(privateUpload('pdf', 'tarea.pdf', pdf), 5);

      await expect(service.resolvePrivate(`${ID}.pdf`)).resolves.toBe(join(privateDir(), `${ID}.pdf`));
      await expect(service.resolvePrivate('../../.env')).resolves.toBeNull();
      await expect(service.resolvePrivate(`${ID}.json`)).resolves.toBeNull(); // la ficha no se descarga

      await service.removePrivate([`${ID}.pdf`, '../../.env']);

      expect(existsSync(join(privateDir(), `${ID}.pdf`))).toBe(false);
      expect(existsSync(join(privateDir(), `${ID}.json`))).toBe(false);
    });
  });

  describe('cleanFileName', () => {
    it('recupera las tildes que multer entrega mal codificadas', () => {
      expect(cleanFileName(Buffer.from('Tarea Ñandú.pdf', 'utf8').toString('latin1'))).toBe('Tarea Ñandú.pdf');
    });

    it('quita rutas y caracteres de control', () => {
      expect(cleanFileName('..\\..\\etc/passwd\u0000.txt')).toBe('.._.._etc_passwd.txt');
    });

    it('un nombre vacío queda como "documento"', () => {
      expect(cleanFileName('   ')).toBe('documento');
    });
  });

  it('exige que venga un archivo', async () => {
    await expect(build(true).service.finish(undefined, 'image')).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('resolve', () => {
    it('solo entrega archivos de la carpeta pública con nombre válido', async () => {
      const { service } = build(true);
      writeFileSync(join(uploadsDir(), `${ID}.webp`), 'x');
      writeFileSync(join(incomingDir(), `${ID}.mov`), 'x');

      await expect(service.resolve(`${ID}.webp`)).resolves.toBe(join(uploadsDir(), `${ID}.webp`));
      await expect(service.resolve(`${ID}.mov`)).resolves.toBeNull(); // el original interno no se entrega
      await expect(service.resolve('../../.env')).resolves.toBeNull();
    });
  });
});
