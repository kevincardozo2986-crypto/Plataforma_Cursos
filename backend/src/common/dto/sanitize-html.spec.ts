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

  it('elimina formularios, estilos, objetos y marcos de otros sitios', () => {
    expect(cleanHtml('<form action="https://malo.com"><input name="clave"></form>')).toBe('');
    expect(cleanHtml('<style>body{display:none}</style><p>ok</p>')).toBe('<p>ok</p>');
    expect(cleanHtml('<object data="x.swf"></object><embed src="x.swf">')).toBe('');
    expect(cleanHtml('<iframe src="https://malo.com/login"></iframe>')).toBe('');
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
