import { embedFromInput, iframeHtml, toEmbed } from './video-embed';

describe('toEmbed: YouTube', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/live/dQw4w9WgXcQ',
    'www.youtube.com/watch?v=dQw4w9WgXcQ',
  ])('%s', (url) => {
    expect(toEmbed(url)).toEqual({
      src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      provider: 'youtube',
    });
  });

  it('un identificador inválido o una página de YouTube sin video no sirve', () => {
    expect(toEmbed('https://www.youtube.com/watch?v=corto')).toBeNull();
    expect(toEmbed('https://www.youtube.com/')).toBeNull();
    expect(toEmbed('https://www.youtube.com/@canal')).toBeNull();
  });
});

describe('toEmbed: otros', () => {
  it('Vimeo', () => {
    for (const url of [
      'https://vimeo.com/123456789',
      'https://vimeo.com/channels/staff/123456789',
      'https://player.vimeo.com/video/123456789',
    ]) {
      expect(toEmbed(url)).toEqual({
        src: 'https://player.vimeo.com/video/123456789',
        provider: 'vimeo',
      });
    }
  });

  it('Loom', () => {
    expect(toEmbed('https://www.loom.com/share/abc123def')).toEqual({
      src: 'https://www.loom.com/embed/abc123def',
      provider: 'loom',
    });
  });

  it('Dailymotion', () => {
    expect(toEmbed('https://www.dailymotion.com/video/x8abcd_titulo')).toEqual({
      src: 'https://www.dailymotion.com/embed/video/x8abcd',
      provider: 'dailymotion',
    });
  });

  it('una presentación de Google ya lista para incrustar', () => {
    const url = 'https://docs.google.com/presentation/d/e/2PACX-abc/embed?start=false';

    expect(toEmbed(url)).toEqual({ src: url, provider: 'other' });
  });

  it('sitios no permitidos, texto suelto o con espacios no sirven', () => {
    expect(toEmbed('https://malo.com/video')).toBeNull();
    expect(toEmbed('http://docs.google.com/x')).toBeNull();
    expect(toEmbed('hola mundo')).toBeNull();
    expect(toEmbed('')).toBeNull();
    expect(toEmbed('javascript:alert(1)')).toBeNull();
  });
});

describe('iframeHtml', () => {
  it('arma el iframe estándar y escapa la dirección', () => {
    const html = iframeHtml('https://www.youtube-nocookie.com/embed/x"y');

    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/x&quot;y"');
    expect(html).toContain('allowfullscreen');
    expect(html.startsWith('<iframe ')).toBe(true);
  });
});

describe('embedFromInput', () => {
  it('un enlace de video da el iframe', () => {
    const result = embedFromInput('https://youtu.be/dQw4w9WgXcQ');

    expect('html' in result && result.html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('el código iframe de un sitio permitido se acepta (y se limpia)', () => {
    const result = embedFromInput(
      '<iframe width="560" height="315" src="https://www.youtube.com/embed/abc" onload="robar()" allowfullscreen></iframe>',
    );

    expect('html' in result && result.html).toContain('src="https://www.youtube.com/embed/abc"');
    expect('html' in result && result.html).not.toContain('onload');
  });

  it('el código iframe de un sitio no permitido se rechaza con un motivo', () => {
    const result = embedFromInput('<iframe src="https://malo.com/login"></iframe>');

    expect('error' in result && result.error).toContain('no está permitido');
  });

  it('algo que no es un video da un mensaje claro', () => {
    expect('error' in embedFromInput('hola')).toBe(true);
    expect('error' in embedFromInput('   ')).toBe(true);
  });
});
