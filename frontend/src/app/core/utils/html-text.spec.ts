import { hasRichFormatting, htmlToText, textToHtml } from './html-text';

describe('textToHtml', () => {
  it('una línea en blanco separa párrafos y un salto simple pasa a <br>', () => {
    expect(textToHtml('Hola\ntodos\n\nNos vemos')).toBe('<p>Hola<br>todos</p><p>Nos vemos</p>');
  });

  it('escapa el HTML escrito, para que no se cuele nada', () => {
    expect(textToHtml('<script>alert(1)</script> & más')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; más</p>',
    );
  });

  it('un texto vacío o en blanco no genera párrafos', () => {
    expect(textToHtml('  \n\n  ')).toBe('');
  });

  it('acepta saltos de línea de Windows', () => {
    expect(textToHtml('a\r\n\r\nb')).toBe('<p>a</p><p>b</p>');
  });
});

describe('htmlToText', () => {
  it('es el camino de vuelta de textToHtml', () => {
    const text = 'Hola\ntodos\n\n<b> & más';

    expect(htmlToText(textToHtml(text))).toBe(text);
  });

  it('quita las etiquetas y mantiene los párrafos', () => {
    expect(htmlToText('<p>La clase es a las <b>8am</b>.</p><p>Traigan <i>todo</i></p>')).toBe(
      'La clase es a las 8am.\n\nTraigan todo',
    );
  });
});

describe('hasRichFormatting', () => {
  it('solo párrafos y saltos no es formato', () => {
    expect(hasRichFormatting('<p>Hola<br>mundo</p>')).toBe(false);
  });

  it('negritas, listas o enlaces sí', () => {
    expect(hasRichFormatting('<p>Hola <b>mundo</b></p>')).toBe(true);
    expect(hasRichFormatting('<ul><li>uno</li></ul>')).toBe(true);
    expect(hasRichFormatting('<a href="https://x.com">x</a>')).toBe(true);
  });
});
