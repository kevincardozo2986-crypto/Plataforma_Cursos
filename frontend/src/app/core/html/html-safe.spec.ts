import {
  countIframes,
  hasVisibleContent,
  IFRAME_HOSTS,
  isSafeUrl,
  sanitizeHtml,
} from './html-safe';

describe('sanitizeHtml', () => {
  it('conserva el formato normal', () => {
    expect(
      sanitizeHtml(
        '<h2>Título</h2><p>Hola <strong>mundo</strong> <em>x</em> <u>y</u></p><ul><li>uno</li></ul>',
      ),
    ).toBe(
      '<h2>Título</h2><p>Hola <strong>mundo</strong> <em>x</em> <u>y</u></p><ul><li>uno</li></ul>',
    );
  });

  it('elimina <script> con su contenido', () => {
    expect(sanitizeHtml('<p>Hola</p><script>alert(1)</script>')).toBe('<p>Hola</p>');
  });

  it('elimina atributos de eventos', () => {
    expect(sanitizeHtml('<p onclick="robar()">Hola</p>')).toBe('<p>Hola</p>');
    expect(sanitizeHtml('<img src="https://x.com/a.png" onerror="robar()">')).toBe(
      '<img src="https://x.com/a.png">',
    );
  });

  it('un onerror en una imagen sin src válido no sobrevive', () => {
    expect(sanitizeHtml('<img src=x onerror=alert(1)>')).not.toContain('onerror');
  });

  it('bloquea javascript: y data: en enlaces e imágenes', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">clic</a>')).toBe('<a>clic</a>');
    expect(sanitizeHtml('<a href="JaVaScRiPt:alert(1)">clic</a>')).toBe('<a>clic</a>');
    expect(sanitizeHtml('<img src="data:image/svg+xml;base64,AAAA">')).toBe('<img>');
  });

  it('permite enlaces http(s), mailto, tel y rutas propias', () => {
    for (const href of [
      'https://x.com',
      'http://x.com',
      'mailto:a@b.com',
      'tel:123',
      '/api/uploads/a.webp',
      '#ancla',
    ]) {
      expect(sanitizeHtml(`<a href="${href}">x</a>`)).toBe(`<a href="${href}">x</a>`);
    }
  });

  it('los enlaces que abren otra pestaña quedan con noopener', () => {
    expect(sanitizeHtml('<a href="https://x.com" target="_blank">x</a>')).toBe(
      '<a href="https://x.com" target="_blank" rel="noopener noreferrer">x</a>',
    );
  });

  it('conserva solo la alineación del estilo', () => {
    expect(sanitizeHtml('<p style="text-align: center">x</p>')).toBe(
      '<p style="text-align:center">x</p>',
    );
    expect(sanitizeHtml('<p style="color:red; text-align:right; position:fixed">x</p>')).toBe(
      '<p style="text-align:right">x</p>',
    );
    expect(sanitizeHtml('<p style="color:red">x</p>')).toBe('<p>x</p>');
  });

  it('quita las etiquetas no permitidas pero deja su texto', () => {
    expect(sanitizeHtml('<form><p>Dentro</p><input name="clave"></form>')).toBe('<p>Dentro</p>');
    expect(sanitizeHtml('<font color="red">rojo</font>')).toBe('rojo');
    expect(sanitizeHtml('<style>body{display:none}</style><p>ok</p>')).toBe('<p>ok</p>');
  });

  it('los iframes: solo los sitios de la lista, siempre con sandbox', () => {
    const youtube = sanitizeHtml(
      '<iframe src="https://www.youtube.com/embed/abc" sandbox="allow-top-navigation" width="560"></iframe>',
    );

    expect(youtube).toContain('src="https://www.youtube.com/embed/abc"');
    expect(youtube).toContain(
      'sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"',
    );
    expect(youtube).not.toContain('allow-top-navigation');
    expect(youtube).toContain('loading="lazy"');

    expect(sanitizeHtml('<iframe src="https://malo.com/login"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="http://www.youtube.com/embed/x"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="https://www.youtube.com.malo.com/x"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe src="javascript:alert(1)"></iframe>')).toBe('');
    expect(sanitizeHtml('<iframe srcdoc="<script>alert(1)</script>"></iframe>')).toBe('');
  });

  it('acepta todos los sitios de la lista', () => {
    for (const host of IFRAME_HOSTS) {
      expect(sanitizeHtml(`<iframe src="https://${host}/embed/x"></iframe>`)).toContain(host);
    }
  });

  it('un texto vacío da vacío', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('isSafeUrl', () => {
  it.each(['https://x.com', '/api/uploads/a.png', '#a'])('acepta %s', (url) =>
    expect(isSafeUrl(url)).toBe(true),
  );
  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    '//malo.com',
    'vbscript:x',
    'java\nscript:alert(1)',
    'ftp://x.com',
  ])('rechaza %s', (url) => expect(isSafeUrl(url)).toBe(false));
});

describe('hasVisibleContent', () => {
  it('vacío es vacío', () => {
    expect(hasVisibleContent('')).toBe(false);
    expect(hasVisibleContent('<p><br></p>')).toBe(false);
    expect(hasVisibleContent('<p>&nbsp;</p>')).toBe(false);
  });

  it('texto, imagen, video o línea son contenido', () => {
    expect(hasVisibleContent('<p>Hola</p>')).toBe(true);
    expect(hasVisibleContent('<p><img src="/a.png"></p>')).toBe(true);
    expect(hasVisibleContent('<iframe src="https://www.youtube.com/embed/x"></iframe>')).toBe(true);
    expect(hasVisibleContent('<hr>')).toBe(true);
  });
});

describe('countIframes', () => {
  it('cuenta los marcos', () => {
    expect(countIframes('<iframe></iframe><p>x</p><IFRAME src="a"></IFRAME>')).toBe(2);
    expect(countIframes('<p>sin marcos</p>')).toBe(0);
  });
});
