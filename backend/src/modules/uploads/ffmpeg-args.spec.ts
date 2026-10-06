import {
  buildFfmpegArgs,
  parseDurationSeconds,
  parseProcessedSeconds,
  percentOf,
} from './ffmpeg-args.js';

const args = (overrides = {}) =>
  buildFfmpegArgs('entrada.mov', 'salida.mp4', { maxHeight: 720, crf: 28, threads: 0, ...overrides });

describe('buildFfmpegArgs', () => {
  it('lee la entrada y escribe la salida (la salida va al final)', () => {
    const list = args();

    expect(list[list.indexOf('-i') + 1]).toBe('entrada.mov');
    expect(list.at(-1)).toBe('salida.mp4');
  });

  it('convierte a H.264 + AAC en MP4 listo para reproducir sin descargarlo entero', () => {
    const list = args();

    expect(list).toEqual(expect.arrayContaining(['libx264', 'aac', 'yuv420p', '+faststart']));
  });

  it('limita el alto pero no agranda un video pequeño', () => {
    expect(args({ maxHeight: 480 })).toContain("scale=-2:'min(480,ih)'");
  });

  it('usa la calidad pedida', () => {
    const list = args({ crf: 32 });

    expect(list[list.indexOf('-crf') + 1]).toBe('32');
  });

  it('el audio es opcional: un video sin sonido no falla', () => {
    expect(args()).toContain('0:a:0?');
  });

  it('solo limita los hilos si se pide', () => {
    expect(args()).not.toContain('-threads');
    const list = args({ threads: 2 });

    expect(list[list.indexOf('-threads') + 1]).toBe('2');
  });

  it('no usa shell: un nombre con caracteres peligrosos viaja como un solo argumento', () => {
    const list = buildFfmpegArgs('a; rm -rf / & b.mp4', 'out.mp4', { maxHeight: 720, crf: 28, threads: 0 });

    expect(list).toContain('a; rm -rf / & b.mp4');
  });
});

describe('parseDurationSeconds', () => {
  it('lee la duración del encabezado de ffmpeg', () => {
    expect(parseDurationSeconds('  Duration: 00:12:34.50, start: 0.000000, bitrate: 1200 kb/s')).toBe(754.5);
    expect(parseDurationSeconds('Duration: 01:00:00.00, start')).toBe(3600);
  });

  it('devuelve null si no hay duración (por ejemplo "N/A")', () => {
    expect(parseDurationSeconds('Duration: N/A, bitrate: N/A')).toBeNull();
    expect(parseDurationSeconds('nada')).toBeNull();
  });
});

describe('parseProcessedSeconds', () => {
  it('toma el último avance informado', () => {
    expect(parseProcessedSeconds('out_time_us=1000000\nprogress=continue\nout_time_us=5500000\n')).toBe(5.5);
  });

  it('devuelve null si no hay avance', () => {
    expect(parseProcessedSeconds('frame=10\nfps=30')).toBeNull();
  });
});

describe('percentOf', () => {
  it('calcula el porcentaje y nunca llega a 100 antes de terminar', () => {
    expect(percentOf(30, 120)).toBe(25);
    expect(percentOf(120, 120)).toBe(99);
    expect(percentOf(500, 120)).toBe(99);
  });

  it('sin duración conocida, 0', () => {
    expect(percentOf(10, null)).toBe(0);
    expect(percentOf(10, 0)).toBe(0);
  });
});
