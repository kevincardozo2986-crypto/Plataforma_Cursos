import {
  formatSize,
  isPlayableVideoUrl,
  isUploadedUrl,
  MAX_UPLOAD_BYTES,
  validateFile,
} from './upload-rules';

const MB = 1024 * 1024;
const HEX = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('validateFile', () => {
  it('acepta un video y una imagen dentro de los límites', () => {
    expect(validateFile('video', { name: 'clase.MP4', size: 80 * MB })).toBeNull();
    expect(validateFile('image', { name: 'portada.webp', size: 2 * MB })).toBeNull();
  });

  it('rechaza una extensión que no corresponde, con los formatos válidos en el mensaje', () => {
    expect(validateFile('video', { name: 'foto.png', size: MB })).toBe('El video debe ser MP4, WebM, MOV u OGG.');
    expect(validateFile('image', { name: 'clip.mp4', size: MB })).toBe('La imagen debe ser JPG, PNG, GIF o WebP.');
    expect(validateFile('image', { name: 'sin-extension', size: MB })).toContain('debe ser');
  });

  it('rechaza un archivo vacío', () => {
    expect(validateFile('video', { name: 'a.mp4', size: 0 })).toBe('El archivo está vacío.');
  });

  it('avisa del tamaño real y del máximo cuando se pasa', () => {
    expect(validateFile('video', { name: 'a.mp4', size: 600 * MB })).toBe(
      'El video pesa 600 MB y el máximo es 500 MB.',
    );
    expect(validateFile('image', { name: 'a.png', size: 51 * MB })).toBe(
      'La imagen pesa 51 MB y el máximo es 50 MB.',
    );
  });

  it('el límite exacto sí se permite', () => {
    expect(validateFile('image', { name: 'a.png', size: MAX_UPLOAD_BYTES.image })).toBeNull();
  });
});

describe('formatSize', () => {
  it.each([
    [500, '1 KB'],
    [150 * 1024, '150 KB'],
    [12.34 * MB, '12,3 MB'],
    [250 * MB, '250 MB'],
  ])('%s bytes -> %s', (bytes, expected) => {
    expect(formatSize(bytes)).toBe(expected);
  });
});

describe('isUploadedUrl', () => {
  it('reconoce un archivo subido y no un enlace externo', () => {
    expect(isUploadedUrl(`/api/uploads/${HEX}.mp4`)).toBe(true);
    expect(isUploadedUrl('https://example.com/a.mp4')).toBe(false);
    expect(isUploadedUrl('/api/uploads/otro.mp4')).toBe(false);
  });
});

describe('isPlayableVideoUrl', () => {
  it.each([
    `/api/uploads/${HEX}.mp4`,
    'https://cdn.example.com/clase.webm',
    'https://cdn.example.com/clase.mp4?token=abc',
  ])('%s se puede reproducir', (url) => {
    expect(isPlayableVideoUrl(url)).toBe(true);
  });

  it.each(['https://youtube.com/watch?v=abc', 'https://vimeo.com/123', ''])('%s no se previsualiza', (url) => {
    expect(isPlayableVideoUrl(url)).toBe(false);
  });
});
