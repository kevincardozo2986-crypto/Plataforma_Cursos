import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { uploadsDir } from '../uploads/upload-paths.js';

/** Read MP4 movie metadata without trusting a duration sent by the browser. */
export async function localVideoDuration(
  source: string,
): Promise<number | null> {
  const match = /^\/api\/uploads\/([a-f0-9]{32}\.mp4)$/i.exec(source);
  if (!match) return null;
  const file = await open(join(uploadsDir(), match[1]), 'r');
  try {
    const { size: fileSize } = await file.stat();
    async function atom(
      start: number,
      end: number,
      target: string,
    ): Promise<{ start: number; end: number } | null> {
      let offset = start;
      while (offset + 8 <= end) {
        const header = Buffer.alloc(16);
        await file.read(header, 0, Math.min(16, end - offset), offset);
        let size = header.readUInt32BE(0);
        let headerSize = 8;
        if (size === 1) {
          size = Number(header.readBigUInt64BE(8));
          headerSize = 16;
        }
        if (size === 0) size = end - offset;
        if (
          !Number.isSafeInteger(size) ||
          size < headerSize ||
          offset + size > end
        )
          return null;
        if (header.toString('ascii', 4, 8) === target)
          return { start: offset + headerSize, end: offset + size };
        offset += size;
      }
      return null;
    }
    const movie = await atom(0, fileSize, 'moov');
    const header = movie && (await atom(movie.start, movie.end, 'mvhd'));
    if (!header || header.end - header.start < 32) return null;
    const bytes = Buffer.alloc(32);
    await file.read(bytes, 0, 32, header.start);
    const version = bytes[0];
    const scale = bytes.readUInt32BE(version === 1 ? 20 : 12);
    const ticks =
      version === 1
        ? Number(bytes.readBigUInt64BE(24))
        : bytes.readUInt32BE(16);
    const duration = ticks / scale;
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } finally {
    await file.close();
  }
}
