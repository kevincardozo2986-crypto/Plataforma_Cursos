import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';

import { parseDurationSeconds, parseProcessedSeconds } from './ffmpeg-args.js';
import { mediaSettings } from './media-settings.js';

export interface RunOptions {
  timeoutMs: number;
  onDuration?: (seconds: number) => void;
  /** Segundos de video ya procesados. */
  onProgress?: (seconds: number) => void;
}

/** Ejecuta ffmpeg. Está aparte para poder reemplazarlo por uno falso en las pruebas. */
@Injectable()
export class FfmpegRunner {
  private lastCheck: { at: number; available: boolean } | null = null;

  /**
   * ¿Está instalado ffmpeg? Si no, los videos se guardan tal cual en vez de fallar.
   * Un "sí" se recuerda; un "no" se vuelve a comprobar cada medio minuto, por si se instala después.
   */
  async isAvailable(): Promise<boolean> {
    const now = Date.now();

    if (this.lastCheck && (this.lastCheck.available || now - this.lastCheck.at < 30_000)) {
      return this.lastCheck.available;
    }

    const available = await new Promise<boolean>((resolve) => {
      const child = spawn(mediaSettings().ffmpegPath, ['-version'], { stdio: 'ignore', windowsHide: true });

      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    });

    this.lastCheck = { at: now, available };

    return available;
  }

  run(args: string[], options: RunOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(mediaSettings().ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let header = '';
      let tail = '';
      let durationSent = false;

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('ffmpeg tardó más del tiempo permitido'));
      }, options.timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        const seconds = parseProcessedSeconds(chunk.toString());

        if (seconds !== null) {
          options.onProgress?.(seconds);
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();

        // La duración total aparece al empezar, en los primeros mensajes.
        if (!durationSent) {
          header += text;
          const duration = parseDurationSeconds(header);

          if (duration !== null) {
            durationSent = true;
            options.onDuration?.(duration);
          } else if (header.length > 16_384) {
            durationSent = true;
          }
        }

        tail = (tail + text).slice(-2_000);
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timer);

        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg terminó con código ${code}: ${tail.trim()}`));
        }
      });
    });
  }
}
