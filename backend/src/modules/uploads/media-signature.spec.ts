import { ALLOWED_EXTENSIONS, detectMedia } from './media-signature.js';

const bytes = (...values: (number | string)[]) =>
  Buffer.concat(
    values.map((value) =>
      typeof value === 'number' ? Buffer.from([value]) : Buffer.from(value, 'latin1'),
    ),
  );

/** Rellena hasta 16 bytes, el tamaño que lee el servidor. */
const head = (...parts: (number | string)[]) => {
  const buffer = bytes(...parts);

  return Buffer.concat([buffer, Buffer.alloc(Math.max(0, 16 - buffer.length))]);
};

describe('detectMedia', () => {
  it('reconoce un PNG', () => {
    expect(detectMedia(head(0x89, 'PNG\r\n', 0x1a, 0x0a))).toEqual({ kind: 'image', extensions: ['png'] });
  });

  it('reconoce un JPEG', () => {
    expect(detectMedia(head(0xff, 0xd8, 0xff, 0xe0))?.extensions).toEqual(['jpg', 'jpeg']);
  });

  it('reconoce un GIF y un WebP', () => {
    expect(detectMedia(head('GIF89a'))?.extensions).toEqual(['gif']);
    expect(detectMedia(head('RIFF', 0, 0, 0, 0, 'WEBP'))?.extensions).toEqual(['webp']);
  });

  it('un RIFF que no es WebP (por ejemplo un WAV o un AVI) no pasa', () => {
    expect(detectMedia(head('RIFF', 0, 0, 0, 0, 'WAVE'))).toBeNull();
  });

  it('reconoce un MP4/MOV por la marca ftyp', () => {
    expect(detectMedia(head(0, 0, 0, 0x18, 'ftypmp42'))).toEqual({
      kind: 'video',
      extensions: ['mp4', 'mov'],
    });
  });

  it('reconoce WebM y Ogg', () => {
    expect(detectMedia(head(0x1a, 0x45, 0xdf, 0xa3))?.kind).toBe('video');
    expect(detectMedia(head('OggS'))?.extensions).toEqual(['ogv', 'ogg']);
  });

  it('rechaza lo que no es una imagen ni un video permitido', () => {
    expect(detectMedia(head('MZ'))).toBeNull(); // ejecutable de Windows
    expect(detectMedia(head('%PDF-1.7'))).toBeNull();
    expect(detectMedia(head('<script>alert(1)'))).toBeNull();
    expect(detectMedia(Buffer.from('corto'))).toBeNull();
  });
});

describe('ALLOWED_EXTENSIONS', () => {
  it('cada tipo solo admite sus extensiones', () => {
    expect(ALLOWED_EXTENSIONS.video).toContain('mp4');
    expect(ALLOWED_EXTENSIONS.video).not.toContain('png');
    expect(ALLOWED_EXTENSIONS.image).toContain('webp');
    expect(ALLOWED_EXTENSIONS.image).not.toContain('mp4');
  });
});
