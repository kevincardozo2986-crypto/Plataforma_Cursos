import { Logger } from '@nestjs/common';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FfmpegRunner, RunOptions } from './ffmpeg-runner.js';
import { ensureUploadDirs, incomingDir, stateDir, uploadsDir } from './upload-paths.js';
import { VideoOptimizerService } from './video-optimizer.service.js';

const ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OTHER = 'b1b2c3d4e5f60718293a4b5c6d7e8f91';

describe('VideoOptimizerService', () => {
  let root: string;
  const previous = process.env.UPLOADS_DIR;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'videos-'));
    process.env.UPLOADS_DIR = root;
    ensureUploadDirs();
    // Los fallos de estas pruebas son simulados: no hace falta ver su registro de error.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    process.env.UPLOADS_DIR = previous;
  });

  /** Un original recién subido, esperando en la carpeta interna. */
  const original = (id: string, ext: string, bytes: number) => {
    const path = join(incomingDir(), `${id}.${ext}`);
    writeFileSync(path, Buffer.alloc(bytes));

    return { id, inputPath: path, inputExt: ext, inputSize: bytes };
  };

  /** ffmpeg simulado: escribe la salida (último argumento) con el tamaño indicado. */
  const fakeRunner = (outputBytes: number, behaviour: Partial<{ fail: boolean; hold: Promise<void> }> = {}) => {
    let running = 0;
    let maxRunning = 0;
    const calls: string[][] = [];

    const runner = {
      isAvailable: async () => true,
      run: async (args: string[], options: RunOptions) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        calls.push(args);

        try {
          options.onDuration?.(100);
          options.onProgress?.(40);
          await behaviour.hold;

          if (behaviour.fail) {
            throw new Error('ffmpeg terminó con código 1: archivo dañado');
          }

          writeFileSync(args.at(-1) as string, Buffer.alloc(outputBytes));
        } finally {
          running--;
        }
      },
    } as unknown as FfmpegRunner;

    return { runner, calls, maxRunning: () => maxRunning };
  };

  it('guarda el video optimizado con su nombre final y borra el original', async () => {
    const { runner } = fakeRunner(300);
    const service = new VideoOptimizerService(runner);

    service.enqueue(original(ID, 'mov', 1000));
    await service.idle();

    const final = join(uploadsDir(), `${ID}.mp4`);

    expect(statSync(final).size).toBe(300);
    expect(existsSync(join(incomingDir(), `${ID}.mov`))).toBe(false);
    expect(readdirSync(stateDir())).toEqual([]);
    await expect(service.statusOf(`${ID}.mp4`)).resolves.toEqual({ status: 'ready', size: 300 });
  });

  it('un MP4 que ya venía muy comprimido no se agranda: se conserva el original', async () => {
    const { runner } = fakeRunner(900);
    const service = new VideoOptimizerService(runner);

    service.enqueue(original(ID, 'mp4', 500));
    await service.idle();

    expect(statSync(join(uploadsDir(), `${ID}.mp4`)).size).toBe(500);
  });

  it('un MOV que sale más grande sí se usa, porque cambia de formato a uno reproducible', async () => {
    const { runner } = fakeRunner(900);
    const service = new VideoOptimizerService(runner);

    service.enqueue(original(ID, 'mov', 500));
    await service.idle();

    expect(statSync(join(uploadsDir(), `${ID}.mp4`)).size).toBe(900);
  });

  it('si ffmpeg falla, borra todo y deja el error a la vista (sin detalles técnicos)', async () => {
    const { runner } = fakeRunner(0, { fail: true });
    const service = new VideoOptimizerService(runner);

    service.enqueue(original(ID, 'mp4', 1000));
    await service.idle();

    expect(existsSync(join(uploadsDir(), `${ID}.mp4`))).toBe(false);
    expect(readdirSync(incomingDir())).toEqual([]);

    const status = await service.statusOf(`${ID}.mp4`);

    expect(status?.status).toBe('failed');
    expect(JSON.stringify(status)).not.toContain('código 1');
  });

  it('mientras se optimiza informa el avance', async () => {
    let release!: () => void;
    const { runner } = fakeRunner(300, { hold: new Promise<void>((resolve) => (release = resolve)) });
    const service = new VideoOptimizerService(runner);

    service.enqueue(original(ID, 'mov', 1000));

    // El avance se guarda como mucho una vez por segundo: se espera a que aparezca en vez de
    // dormir un tiempo fijo, que con el equipo ocupado a veces no alcanza.
    await vi.waitFor(
      async () => {
        await expect(service.statusOf(`${ID}.mp4`)).resolves.toEqual({ status: 'processing', percent: 40 });
      },
      { timeout: 10_000, interval: 100 },
    );

    release();
    await service.idle();
  });

  it('procesa de a un video por vez, aunque se suban varios juntos', async () => {
    const { runner, maxRunning } = fakeRunner(300);
    const service = new VideoOptimizerService(runner);

    service.enqueue(original(ID, 'mov', 1000));
    service.enqueue(original(OTHER, 'mov', 1000));
    await service.idle();

    expect(maxRunning()).toBe(1);
    expect(existsSync(join(uploadsDir(), `${ID}.mp4`))).toBe(true);
    expect(existsSync(join(uploadsDir(), `${OTHER}.mp4`))).toBe(true);
  });

  it('un fallo no detiene los videos que siguen en la cola', async () => {
    let calls = 0;
    const runner = {
      isAvailable: async () => true,
      run: async (args: string[]) => {
        calls++;

        if (calls === 1) {
          throw new Error('dañado');
        }

        writeFileSync(args.at(-1) as string, Buffer.alloc(100));
      },
    } as unknown as FfmpegRunner;
    const service = new VideoOptimizerService(runner);

    service.enqueue(original(ID, 'mov', 1000));
    service.enqueue(original(OTHER, 'mov', 1000));
    await service.idle();

    await expect(service.statusOf(`${ID}.mp4`)).resolves.toMatchObject({ status: 'failed' });
    await expect(service.statusOf(`${OTHER}.mp4`)).resolves.toMatchObject({ status: 'ready' });
  });

  it('al arrancar retoma los originales que quedaron a medias y limpia restos', async () => {
    const { runner } = fakeRunner(200);
    const service = new VideoOptimizerService(runner);

    original(ID, 'mov', 1000); // quedó esperando antes de reiniciar el servidor
    writeFileSync(join(incomingDir(), `${OTHER}.out.mp4`), 'resto de una conversión partida');

    await service.onModuleInit();
    await service.idle();

    expect(statSync(join(uploadsDir(), `${ID}.mp4`)).size).toBe(200);
    expect(existsSync(join(incomingDir(), `${OTHER}.out.mp4`))).toBe(false);
  });

  it('un archivo que no existe ni se está procesando no tiene estado', async () => {
    const service = new VideoOptimizerService(fakeRunner(1).runner);

    await expect(service.statusOf(`${ID}.mp4`)).resolves.toBeNull();
    await expect(service.statusOf('../../etc/passwd')).resolves.toBeNull();
    await expect(service.statusOf('corto.mp4')).resolves.toBeNull();
  });

  it('pide ffmpeg que reduzca a 720 por defecto y con el original como entrada', async () => {
    const { runner, calls } = fakeRunner(100);
    const service = new VideoOptimizerService(runner);

    service.enqueue(original(ID, 'mov', 1000));
    await service.idle();

    const args = calls[0];

    expect(args).toContain("scale=-2:'min(720,ih)'");
    expect(args[args.indexOf('-i') + 1]).toBe(join(incomingDir(), `${ID}.mov`));
  });
});
