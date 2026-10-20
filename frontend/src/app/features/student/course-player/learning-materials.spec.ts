import { TestBed } from '@angular/core/testing';
import { CodePractice, buildPracticeDocument } from './code-practice';
import { materialKind, allowedMaterialUrl } from './lesson-resource';
describe('Learning material rendering', () => {
  it.each([
    ['PDF', 'https://example.com/file', 'pdf'],
    ['AUDIO', 'https://example.com/voice', 'audio'],
    ['VIDEO', 'https://example.com/movie.ogg', 'video'],
    ['IMAGE', 'https://example.com/diagram', 'image'],
    ['INTERACTIVE', 'https://example.com/activity', 'interactive'],
    ['OTHER', 'https://example.com/voice.mp3?x=1', 'audio'],
    ['DOCUMENT', 'https://example.com/read.pdf', 'pdf'],
  ])('classifies %s material without losing its explicit type', (type, url, expected) => {
    expect(materialKind({ id: 1, title: 'Material', type, url })).toBe(expected);
  });
  it.each(['javascript:alert(1)', 'data:text/html,hello', '//example.com/file', 'file:///secret'])(
    'rejects executable or local-file URLs: %s',
    (url) => expect(allowedMaterialUrl(url)).toBe(false),
  );
  it('accepts platform uploads and HTTP(S) materials', () => {
    expect(allowedMaterialUrl('/api/uploads/' + 'a'.repeat(32) + '.pdf')).toBe(true);
    expect(allowedMaterialUrl('https://example.com/audio.mp3')).toBe(true);
  });
});
describe('Isolated code practice', () => {
  afterEach(() => localStorage.removeItem('campus.practice:test'));
  it('builds a preview that blocks external requests and embeds the student code', () => {
    const html = buildPracticeDocument('<h1>Hola</h1>', 'h1{color:blue}', "console.log('hello')");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain('<h1>Hola</h1>');
    expect(html).toContain('h1{color:blue}');
    expect(html).toContain("console.log('hello')");
    expect(html).toContain('</script>');
  });
  it('persists the code draft and renders execution in a sandbox without same-origin access', () => {
    const fixture = TestBed.createComponent(CodePractice);
    fixture.componentRef.setInput('scope', 'campus.practice:test');
    fixture.detectChanges();
    fixture.componentInstance.edit('<h2>Mi prueba</h2>');
    expect(JSON.parse(localStorage.getItem('campus.practice:test')!).html).toBe(
      '<h2>Mi prueba</h2>',
    );
    fixture.componentInstance.run();
    fixture.detectChanges();
    const iframe = fixture.nativeElement.querySelector('iframe');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.getAttribute('srcdoc')).toContain('<h2>Mi prueba</h2>');
  });
  it('keeps separate Java and Python drafts and does not run them as JavaScript', () => {
    const fixture = TestBed.createComponent(CodePractice);
    fixture.componentRef.setInput('scope', 'campus.practice:test');
    fixture.detectChanges();
    const editor = fixture.componentInstance;
    editor.selected.set('Java');
    editor.edit('public class Main {}');
    expect(editor.source()).toBe('public class Main {}');
    editor.selected.set('Python');
    editor.edit('print(42)');
    expect(editor.source()).toBe('print(42)');
    editor.run();
    expect(editor.preview()).toBeNull();
    editor.selected.set('Java');
    expect(editor.source()).toBe('public class Main {}');
    const saved = JSON.parse(localStorage.getItem('campus.practice:test')!);
    expect(saved.java).toBe('public class Main {}');
    expect(saved.python).toBe('print(42)');
  });
});
