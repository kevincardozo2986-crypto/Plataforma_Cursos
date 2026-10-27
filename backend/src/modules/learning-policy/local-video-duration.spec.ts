import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localVideoDuration } from './local-video-duration.js';

const folder = vi.hoisted(() => ({ path: '' }));
vi.mock('../uploads/upload-paths.js', () => ({ uploadsDir: () => folder.path }));
const name = 'a'.repeat(32) + '.mp4';
function atom(type: string, content: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(content.length + 8, 0);
  header.write(type, 4, 'ascii');
  return Buffer.concat([header, content]);
}
describe('Authoritative duration of uploaded MP4 files', () => {
  beforeEach(async () => { folder.path = await mkdtemp(join(tmpdir(), 'campus-video-duration-')); });
  afterEach(async () => { await rm(folder.path, { recursive: true, force: true }); });
  it('reads movie metadata after media data instead of trusting the reported duration', async () => {
    const movieHeader = Buffer.alloc(48);
    movieHeader.writeUInt32BE(1000, 12);
    movieHeader.writeUInt32BE(100000, 16);
    await writeFile(join(folder.path, name), Buffer.concat([atom('mdat', Buffer.alloc(128)), atom('moov', atom('mvhd', movieHeader))]));
    expect(await localVideoDuration('/api/uploads/' + name)).toBe(100);
  });
  it('supports version 1 movie headers and rejects a malformed atom', async () => {
    const movieHeader = Buffer.alloc(48);
    movieHeader[0] = 1;
    movieHeader.writeUInt32BE(1000, 20);
    movieHeader.writeBigUInt64BE(120000n, 24);
    await writeFile(join(folder.path, name), atom('moov', atom('mvhd', movieHeader)));
    expect(await localVideoDuration('/api/uploads/' + name)).toBe(120);
    await writeFile(join(folder.path, name), Buffer.from([0,0,0,1,109,111,111,118,0,0,0,0,0,0,0,0]));
    expect(await localVideoDuration('/api/uploads/' + name)).toBeNull();
  });
  it('never resolves remote URLs or paths outside the upload directory', async () => {
    expect(await localVideoDuration('https://example.com/video.mp4')).toBeNull();
    expect(await localVideoDuration('/api/uploads/../../secret.mp4')).toBeNull();
  });
});
