import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { buildFfmpegArgs, percentOf } from './ffmpeg-args.js';
import { FfmpegRunner } from './ffmpeg-runner.js';
import { mediaSettings } from './media-settings.js';
import { idOf, incomingDir, STORED_NAME, stateDir, uploadsDir } from './upload-paths.js';

export interface VideoJob {
  id: string;
  /** Ruta del original, dentro de .incoming. */
  inputPath: string;
  inputExt: string;
  inputSize: number;
}

export type MediaStatus =
  | { status: 'ready'; size: number }
  | { status: 'processing'; percent: number }
  | { status: 'failed'; message: string };

type StoredState = { status: 'processing'; percent: number } | { status: 'failed'; message: string };

const FAILURE_MESSAGE =
  'No pudimos optimizar el video. Prueba con otro archivo (MP4, MOV o WebM).';

const PENDING_ORIGINAL = /^([a-f0-9]{32})\.(mp4|mov|webm|ogv|ogg)$/;

/**
 * Cola de optimización de videos. Procesa de a uno (ffmpeg usa mucho procesador),
 * guarda solo el resultado y borra el original. El avance y los errores se
 * guardan en archivos pequeños, así sobreviven a un reinicio del servidor: al
 * arrancar se retoman los videos que quedaron a medias.
 */
@Injectable()
export class VideoOptimizerService implements OnModuleInit {
  private readonly logger = new Logger(VideoOptimizerService.name);
  private chain: Promise<void> = Promise.resolve();
  /** Última operación pendiente sobre el estado de cada video (ver `inOrder`). */
  private readonly stateOps = new Map<string, Promise<void>>();

  constructor(private readonly runner: FfmpegRunner) {}

  async onModuleInit(): Promise<void> {
    await this.requeuePending();
  }

  enqueue(job: VideoJob): void {
    void this.writeState(job.id, { status: 'processing', percent: 0 });
    this.chain = this.chain.then(() => this.process(job));
  }

  /** Resolución del estado de un archivo por su nombre; null si no existe ni se está procesando. */
  async statusOf(name: string): Promise<MediaStatus | null> {
    if (!STORED_NAME.test(name)) {
      return null;
    }

    const finalPath = join(uploadsDir(), name);

    if (existsSync(finalPath)) {
      return { status: 'ready', size: (await stat(finalPath)).size };
    }

    const state = await this.readState(idOf(name));

    if (state) {
      return state;
    }

    return (await this.hasPendingOriginal(idOf(name))) ? { status: 'processing', percent: 0 } : null;
  }

  /** Espera a que termine todo lo encolado hasta ahora. Útil en pruebas. */
  async idle(): Promise<void> {
    await this.chain;
  }

  private async process(job: VideoJob): Promise<void> {
    const settings = mediaSettings();
    const output = join(uploadsDir(), `${job.id}.mp4`);
    const temporary = join(incomingDir(), `${job.id}.out.mp4`);

    let totalSeconds: number | null = null;
    let lastPercent = -1;
    let lastWrite = 0;

    try {
      await this.runner.run(
        buildFfmpegArgs(job.inputPath, temporary, {
          maxHeight: settings.videoMaxHeight,
          crf: settings.videoCrf,
          threads: settings.ffmpegThreads,
        }),
        {
          timeoutMs: settings.videoTimeoutMs,
          onDuration: (seconds) => (totalSeconds = seconds),
          onProgress: (seconds) => {
            const percent = percentOf(seconds, totalSeconds);

            // Como mucho una vez por segundo y solo si cambió.
            if (percent !== lastPercent && Date.now() - lastWrite > 1_000) {
              lastPercent = percent;
              lastWrite = Date.now();
              void this.writeState(job.id, { status: 'processing', percent });
            }
          },
        },
      );

      const optimizedSize = (await stat(temporary)).size;

      // Un MP4 que ya venía muy comprimido no mejora: se conserva el original en vez de agrandarlo.
      if (job.inputExt === 'mp4' && optimizedSize >= job.inputSize) {
        await rename(job.inputPath, output);
        await rm(temporary, { force: true });
      } else {
        await rename(temporary, output);
        await rm(job.inputPath, { force: true });
      }

      await this.clearState(job.id);
      this.logger.log(`Video ${job.id} listo: ${job.inputSize} → ${(await stat(output)).size} bytes`);
    } catch (error) {
      await rm(temporary, { force: true });
      await rm(job.inputPath, { force: true });
      await this.writeState(job.id, { status: 'failed', message: FAILURE_MESSAGE });
      this.logger.error(`No se pudo optimizar el video ${job.id}: ${(error as Error).message}`);
    }
  }

  /** Al arrancar: retoma los originales que quedaron esperando y borra restos de conversiones partidas. */
  private async requeuePending(): Promise<void> {
    let names: string[];

    try {
      names = await readdir(incomingDir());
    } catch {
      return; // todavía no hay carpeta: no hay nada pendiente
    }

    for (const name of names) {
      if (name.endsWith('.out.mp4')) {
        await rm(join(incomingDir(), name), { force: true });
        continue;
      }

      const match = PENDING_ORIGINAL.exec(name);

      if (!match) {
        continue;
      }

      const inputPath = join(incomingDir(), name);

      this.enqueue({
        id: match[1],
        inputPath,
        inputExt: match[2],
        inputSize: (await stat(inputPath)).size,
      });
    }
  }

  private async hasPendingOriginal(id: string): Promise<boolean> {
    try {
      return (await readdir(incomingDir())).some((name) => name.startsWith(`${id}.`));
    } catch {
      return false;
    }
  }

  private statePath(id: string): string {
    return join(stateDir(), `${id}.json`);
  }

  private writeState(id: string, state: StoredState): Promise<void> {
    return this.inOrder(id, async () => {
      try {
        await mkdir(stateDir(), { recursive: true });
        await writeFile(this.statePath(id), JSON.stringify(state));
      } catch {
        /* El avance es informativo: no debe romper la conversión. */
      }
    });
  }

  /**
   * Las operaciones sobre el estado de un mismo video se ejecutan una tras otra, en el orden
   * en que se pidieron. Sin esto, dos escrituras casi simultáneas (el "0 %" inicial y el primer
   * avance) podían terminar al revés y dejar el estado viejo, o una escritura tardía podía
   * recrear el archivo justo después de borrarlo al terminar.
   */
  private inOrder(id: string, operation: () => Promise<void>): Promise<void> {
    const next = (this.stateOps.get(id) ?? Promise.resolve()).then(operation);

    this.stateOps.set(id, next);
    void next.finally(() => {
      if (this.stateOps.get(id) === next) {
        this.stateOps.delete(id);
      }
    });

    return next;
  }

  private async readState(id: string): Promise<StoredState | null> {
    try {
      return JSON.parse(await readFile(this.statePath(id), 'utf8')) as StoredState;
    } catch {
      return null;
    }
  }

  private clearState(id: string): Promise<void> {
    return this.inOrder(id, () => rm(this.statePath(id), { force: true }));
  }
}
