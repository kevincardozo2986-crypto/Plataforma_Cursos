import { cleanHtml, hasVisibleText } from './sanitize-html.js';

describe('hasVisibleText', () => {
  it('un HTML sin texto cuenta como vacío', () => {
    expect(hasVisibleText('')).toBe(false);
    expect(hasVisibleText('<p></p>')).toBe(false);
    expect(hasVisibleText('<p><br></p>')).toBe(false);
    expect(hasVisibleText('<p>&nbsp;</p>')).toBe(false);
  });

  it('con algo de texto cuenta como lleno', () => {
    expect(hasVisibleText('<p>Hola</p>')).toBe(true);
    expect(hasVisibleText('Solo texto')).toBe(true);
  });
});

describe('cleanHtml', () => {
  it('conserva el formato normal: títulos, negritas, listas y enlaces', () => {
    const html =
      '<h2>Bienvenido</h2><p>Texto con <strong>negrita</strong> y <em>cursiva</em>.</p>' +
      '<ul><li>Uno</li><li>Dos</li></ul><a href="https://ejemplo.com">enlace</a>';

    expect(cleanHtml(html)).toBe(html);
  });

  it('conserva imágenes, tablas y código', () => {
    const html =
      '<img src="/api/uploads/a1b2c3d4e5f60718293a4b5c6d7e8f90.webp" alt="logo" />' +
      '<table><tbody><tr><td colspan="2">x</td></tr></tbody></table><pre><code>let a = 1;</code></pre>';

    expect(cleanHtml(html)).toBe(html);
  });

  it('elimina <script> completo, con su contenido', () => {
    expect(cleanHtml('<p>Hola</p><script>alert(1)</script>')).toBe('<p>Hola</p>');
  });

  it('elimina atributos de eventos y estilos', () => {
    expect(cleanHtml('<p onclick="robar()" style="color:red">Hola</p>')).toBe('<p>Hola</p>');
    expect(cleanHtml('<img src="https://x.com/a.png" onerror="robar()">')).toBe(
      '<img src="https://x.com/a.png" />',
    );
  });

  it('bloquea enlaces javascript: y data:', () => {
    expect(cleanHtml('<a href="javascript:alert(1)">clic</a>')).toBe('<a>clic</a>');
    expect(cleanHtml('<a href="JaVaScRiPt:alert(1)">clic</a>')).toBe('<a>clic</a>');
    expect(cleanHtml('<img src="data:image/svg+xml;base64,AAAA">')).toBe('<img />');
  });

  it('elimina formularios, estilos y objetos', () => {
    expect(cleanHtml('<form action="https://malo.com"><input name="clave"></form>')).toBe('');
    expect(cleanHtml('<style>body{display:none}</style><p>ok</p>')).toBe('<p>ok</p>');
    expect(cleanHtml('<object data="x.swf"></object><embed src="x.swf">')).toBe('');
  });

  it('permite incrustar videos de YouTube y Vimeo', () => {
    const youtube = '<iframe src="https://www.youtube.com/embed/abc123" width="560" height="315" allowfullscreen></iframe>';

    expect(cleanHtml(youtube)).toContain('src="https://www.youtube.com/embed/abc123"');
    expect(cleanHtml('<iframe src="https://player.vimeo.com/video/1"></iframe>')).toContain('player.vimeo.com');
  });

  it('los enlaces que abren otra pestaña quedan con noopener', () => {
    expect(cleanHtml('<a href="https://x.com" target="_blank">x</a>')).toBe(
      '<a href="https://x.com" target="_blank" rel="noopener noreferrer">x</a>',
    );
  });

  it('un texto sin etiquetas queda igual', () => {
    expect(cleanHtml('Solo texto, sin HTML')).toBe('Solo texto, sin HTML');
  });
});

describe('cleanHtml: editor enriquecido', () => {
  it('conserva la alineación del texto y descarta los demás estilos', () => {
    expect(cleanHtml('<p style="text-align: center">Hola</p>')).toBe('<p style="text-align:center">Hola</p>');
    expect(cleanHtml('<p style="text-align:right; color:red; position:fixed">Hola</p>')).toBe(
      '<p style="text-align:right">Hola</p>',
    );
    expect(cleanHtml('<p style="text-align:expression(alert(1))">Hola</p>')).toBe('<p>Hola</p>');
  });

  it('admite iframes de cualquier sitio con https', () => {
    for (const url of [
      'https://www.youtube.com/embed/x',
      'https://sitio-cualquiera.com/pagina.html',
      'https://app.ejemplo.edu.co:8443/ruta/index.html?a=1&b=2',
      'https://campusvirtual.santototunja.edu.co/Web_Secciones_Entrega/01_Hero_Induccion.html',
    ]) {
      expect(cleanHtml(`<iframe src="${url}"></iframe>`)).toContain('<iframe src="https://');
    }
  });

  it('rechaza lo que no es una dirección https absoluta', () => {
    expect(cleanHtml('<iframe src="http://sitio.com/x.html"></iframe>')).toBe('');
    expect(cleanHtml('<iframe src="//sitio.com/x"></iframe>')).toBe('');
    expect(cleanHtml('<iframe src="/api/uploads/x.html"></iframe>')).toBe('');
    expect(cleanHtml('<iframe src="x.html"></iframe>')).toBe('');
    expect(cleanHtml('<iframe src="ftp://sitio.com/x"></iframe>')).toBe('');
  });

  it('no deja que un marco cargue esta misma plataforma', () => {
    expect(cleanHtml('<iframe src="https://localhost/x"></iframe>')).toBe('');
    expect(cleanHtml('<iframe src="https://127.0.0.1/x"></iframe>')).toBe('');
    expect(cleanHtml('<iframe src="https://[::1]/x"></iframe>')).toBe('');
  });

  it('ni un nombre sin punto', () => {
    expect(cleanHtml('<iframe src="https://intranet/x.html"></iframe>')).toBe('');
  });

  it('tampoco la dirección configurada en APP_URL', () => {
    const before = process.env.APP_URL;

    process.env.APP_URL = 'https://campus.miuniversidad.edu.co';
    try {
      expect(cleanHtml('<iframe src="https://campus.miuniversidad.edu.co/inicio"></iframe>')).toBe('');
      expect(cleanHtml('<iframe src="https://otro.miuniversidad.edu.co/inicio"></iframe>')).toContain('otro.miuniversidad');
    } finally {
      if (before === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = before;
    }
  });

  it('todo marco queda con sandbox y carga diferida, aunque pidan otra cosa', () => {
    const html = cleanHtml(
      '<iframe src="https://www.youtube.com/embed/x" sandbox="allow-top-navigation allow-forms" loading="eager"></iframe>',
    );

    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"');
    expect(html).not.toContain('allow-top-navigation');
    expect(html).toContain('loading="lazy"');
  });

  it('un iframe con javascript: o data: en el src se elimina', () => {
    expect(cleanHtml('<iframe src="javascript:alert(1)"></iframe>')).toBe('');
    expect(cleanHtml('<iframe src="data:text/html,<script>alert(1)</script>"></iframe>')).toBe('');
  });

  it('un iframe con srcdoc no puede colar HTML propio', () => {
    expect(cleanHtml('<iframe srcdoc="<script>alert(1)</script>"></iframe>')).toBe('');
  });
});

describe('páginas del propio campus virtual', () => {
  const pasted = `<iframe
  src="https://campusvirtual.santototunja.edu.co/Web_Secciones_Entrega/01_Hero_Induccion.html"
  width="100%"
  height="900"
  style="border: 0; display: block;"
  allow="fullscreen"
  allowfullscreen>
</iframe>`;

  it('el iframe de una sección del campus se conserva con su tamaño, aislado y sin estilos arbitrarios', () => {
    const clean = cleanHtml(pasted);

    expect(clean).toContain('src="https://campusvirtual.santototunja.edu.co/Web_Secciones_Entrega/01_Hero_Induccion.html"');
    expect(clean).toContain('width="100%"');
    expect(clean).toContain('height="900"');
    expect(clean).toContain('allowfullscreen');
    expect(clean).toContain('sandbox="');
    expect(clean).not.toContain('style=');
    expect(clean).not.toContain('allow="');
  });

  it('sigue siendo solo https', () => {
    expect(cleanHtml('<iframe src="http://campusvirtual.santototunja.edu.co/x.html"></iframe>')).toBe('');
  });
});
