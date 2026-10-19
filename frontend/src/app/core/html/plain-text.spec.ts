import { htmlToPlainText } from './plain-text';

describe('htmlToPlainText', () => {
  it('sin nada devuelve vacío', () => {
    expect(htmlToPlainText(null)).toBe('');
    expect(htmlToPlainText(undefined)).toBe('');
    expect(htmlToPlainText('')).toBe('');
  });

  it('quita las etiquetas y separa los párrafos con un espacio', () => {
    expect(
      htmlToPlainText('<h2>Título</h2><p>Hola <strong>mundo</strong></p><p>Otro<br>renglón</p>'),
    ).toBe('Título Hola mundo Otro renglón');
  });

  it('un texto sin etiquetas queda igual (cursos antiguos en texto plano)', () => {
    expect(htmlToPlainText('Aprende Node desde cero')).toBe('Aprende Node desde cero');
  });

  it('decodifica las entidades', () => {
    expect(htmlToPlainText('<p>Tom &amp; Jerry &lt;3 &quot;hola&quot;&nbsp;ya</p>')).toBe(
      'Tom & Jerry <3 "hola" ya',
    );
  });

  it('los videos, scripts y estilos no dejan rastro', () => {
    expect(
      htmlToPlainText(
        '<p>Antes</p><iframe src="https://www.youtube.com/embed/x"></iframe><script>alert(1)</script><p>Después</p>',
      ),
    ).toBe('Antes Después');
  });
});
