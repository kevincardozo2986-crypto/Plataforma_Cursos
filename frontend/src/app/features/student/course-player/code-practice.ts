import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
export function buildPracticeDocument(html: string, css: string, js: string): string {
  const safeCss = css.replace(/<\/style/gi, '<\\/style');
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;padding:20px;margin:0;} ${safeCss}</style></head><body>${html}<script>const emit=(...args)=>parent.postMessage({type:'campus-practice-log',args:args.map(x=>{try{return typeof x==='string'?x:JSON.stringify(x)}catch{return String(x)}})},'*');console.log=emit;console.error=emit;window.addEventListener('error',e=>emit('Error: '+e.message));try{${safeJs}\n}catch(e){emit('Error: '+e.message)}<\/script></body></html>`;
}
@Component({
  selector: 'app-code-practice',
  imports: [FormsModule],
  template: `
    <div class="practice-heading">
      <div>
        <h3>Prueba tus ideas</h3>
        <p>
          Escribe HTML, CSS, JavaScript, Java o Python. Tu borrador se guarda en este navegador; no
          es una entrega al docente.
        </p>
      </div>
      @if (webLanguage()) {
        <button class="run" (click)="run()">&#9654; Ejecutar web</button>
      } @else {
        <button class="run" (click)="download()">
          Descargar {{ selected() === 'Java' ? 'Main.java' : 'main.py' }}
        </button>
      }
    </div>
    <div class="editor-layout">
      <section class="editor">
        <div class="languages" aria-label="Lenguaje del editor">
          @for (language of languages; track language) {
            <button
              [class.active]="selected() === language"
              [attr.aria-pressed]="selected() === language"
              (click)="selected.set(language)"
            >
              {{ language }}
            </button>
          }
        </div>
        <label class="sr-only" for="practice-code">Código {{ selected() }}</label
        ><textarea
          id="practice-code"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          maxlength="50000"
          [ngModel]="source()"
          (ngModelChange)="edit($event)"
          (keydown.tab)="indent($event)"
        ></textarea>
        <p class="storage" role="status">{{ notice() }}</p>
      </section>
      <section class="result">
        <header>Vista previa</header>
        @if (!webLanguage()) {
          <div class="empty-preview">
            <div>
              <strong>{{ selected() }}</strong>
              <p>
                Puedes escribir y guardar tu código aquí. Descárgalo para ejecutarlo en tu entorno
                de {{ selected() }}. La ejecución de este lenguaje dentro del aula aún no está
                habilitada.
              </p>
            </div>
          </div>
        } @else if (preview(); as document) {
          <iframe
            #previewFrame
            title="Resultado de tu codigo"
            sandbox="allow-scripts"
            [srcdoc]="document"
          ></iframe>
        } @else {
          <div class="empty-preview">Escribe tu código y pulsa Ejecutar para ver el resultado.</div>
        }
      </section>
    </div>
    <details class="console">
      <summary>
        Consola <span>{{ logs().length }}</span>
      </summary>
      <pre>{{
        logs().join(
          '
'
        ) || 'Los mensajes de console.log apareceran aqui.'
      }}</pre>
    </details>
  `,
  styles: `
    :host {
      display: block;
    }
    h3 {
      margin: 0;
      font-size: 1rem;
    }
    p {
      font-size: 0.75rem;
      color: var(--muted, #647a9d);
      line-height: 1.7;
      margin: 7px 0 0;
    }
    button {
      font: inherit;
      cursor: pointer;
      border: 0;
    }
    .practice-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }
    .run {
      padding: 11px 17px;
      border-radius: 11px;
      color: #fff;
      background: #1265ed;
      font-size: 0.75rem;
      white-space: nowrap;
    }
    .editor-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border: 1px solid var(--border, #e1eaf6);
      border-radius: 14px;
      overflow: hidden;
    }
    .editor {
      background: #112338;
      min-width: 0;
    }
    .languages {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 10px;
      background: #0c1c2d;
    }
    .languages button {
      background: transparent;
      color: #91a9c8;
      padding: 7px 10px;
      border-radius: 7px;
      font-size: 0.65rem;
    }
    .languages .active {
      background: #22466d;
      color: white;
    }
    textarea {
      display: block;
      resize: vertical;
      box-sizing: border-box;
      width: 100%;
      min-height: 310px;
      padding: 16px;
      border: 0;
      background: transparent;
      color: #cde4ff;
      font:
        12px/1.8 Consolas,
        monospace;
      tab-size: 2;
      outline-offset: -3px;
    }
    .storage {
      padding: 0 12px 10px;
      font-size: 0.6rem;
      color: #99b7d9;
      min-height: 14px;
    }
    .result {
      background: #fff;
      min-width: 0;
    }
    .result header {
      padding: 13px 16px;
      border-bottom: 1px solid #e1eaf6;
      font-size: 0.7rem;
      color: #647a9d;
    }
    iframe {
      display: block;
      box-sizing: border-box;
      width: 100%;
      height: 350px;
      border: 0;
      background: white;
    }
    .empty-preview {
      display: grid;
      place-items: center;
      min-height: 300px;
      padding: 20px;
      text-align: center;
      color: #647a9d;
      font-size: 0.8rem;
    }
    .console {
      border: 1px solid var(--border, #e1eaf6);
      border-radius: 10px;
      margin-top: 12px;
      font-size: 0.75rem;
      overflow: hidden;
    }
    summary {
      padding: 10px 14px;
      cursor: pointer;
    }
    summary span {
      float: right;
      color: #647a9d;
    }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: 150px;
      overflow: auto;
      background: #112338;
      color: #cde4ff;
      padding: 14px;
      margin: 0;
      font-size: 0.7rem;
    }
    button:focus-visible,
    textarea:focus-visible {
      outline: 3px solid #2279ff;
      outline-offset: 2px;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    @media (max-width: 700px) {
      .editor-layout {
        grid-template-columns: 1fr;
      }
      .practice-heading {
        align-items: flex-start;
      }
      iframe {
        height: 280px;
      }
      textarea {
        min-height: 220px;
      }
    }
  `,
})
export class CodePractice {
  readonly scope = input.required<string>();
  private readonly sanitizer = inject(DomSanitizer);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('previewFrame');
  readonly languages = ['HTML', 'CSS', 'JavaScript', 'Java', 'Python'] as const;
  readonly selected = signal<'HTML' | 'CSS' | 'JavaScript' | 'Java' | 'Python'>('HTML');
  readonly webLanguage = computed(() => !['Java', 'Python'].includes(this.selected()));
  readonly java = signal(
    'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hola, mundo");\n  }\n}',
  );
  readonly python = signal('print("Hola, mundo")');
  readonly html = signal('<h1>Hola, mundo</h1>\n<p>Este es mi espacio para practicar.</p>');
  readonly css = signal('h1 { color: #1265ed; }');
  readonly js = signal("console.log('Listo para aprender');");
  readonly source = computed(() => {
    switch (this.selected()) {
      case 'HTML':
        return this.html();
      case 'CSS':
        return this.css();
      case 'Java':
        return this.java();
      case 'Python':
        return this.python();
      default:
        return this.js();
    }
  });
  readonly preview = signal<SafeHtml | null>(null);
  readonly logs = signal<string[]>([]);
  readonly notice = signal('');
  constructor() {
    effect(() => {
      const key = this.scope();
      this.preview.set(null);
      this.logs.set([]);
      this.notice.set('');
      this.html.set('<h1>Hola, mundo</h1>\n<p>Este es mi espacio para practicar.</p>');
      this.css.set('h1 { color: #1265ed; }');
      this.js.set("console.log('Listo para aprender');");
      this.java.set(
        'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hola, mundo");\n  }\n}',
      );
      this.python.set('print("Hola, mundo")');
      try {
        const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
        if (
          stored &&
          typeof stored.html === 'string' &&
          typeof stored.css === 'string' &&
          typeof stored.js === 'string'
        ) {
          this.html.set(stored.html);
          this.css.set(stored.css);
          this.js.set(stored.js);
          if (typeof stored.java === 'string') this.java.set(stored.java);
          if (typeof stored.python === 'string') this.python.set(stored.python);
        }
      } catch {
        this.notice.set('No se pudo recuperar el borrador local.');
      }
    });
  }
  edit(value: string): void {
    if (this.selected() === 'HTML') this.html.set(value);
    else if (this.selected() === 'CSS') this.css.set(value);
    else if (this.selected() === 'Java') this.java.set(value);
    else if (this.selected() === 'Python') this.python.set(value);
    else this.js.set(value);
    try {
      localStorage.setItem(
        this.scope(),
        JSON.stringify({
          html: this.html(),
          css: this.css(),
          js: this.js(),
          java: this.java(),
          python: this.python(),
        }),
      );
      this.notice.set('Borrador guardado en este navegador.');
    } catch {
      this.notice.set('No se pudo guardar. Copia tu codigo antes de salir.');
    }
  }
  run(): void {
    if (!this.webLanguage()) return;
    this.logs.set([]);
    this.preview.set(
      this.sanitizer.bypassSecurityTrustHtml(
        buildPracticeDocument(this.html(), this.css(), this.js()),
      ),
    );
  }
  download(): void {
    const blob = new Blob([this.source()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = this.selected() === 'Java' ? 'Main.java' : 'main.py';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  indent(event: Event): void {
    event.preventDefault();
    const el = event.target as HTMLTextAreaElement;
    const start = el.selectionStart;
    const value = el.value.slice(0, start) + '  ' + el.value.slice(el.selectionEnd);
    this.edit(value);
    el.value = value;
    el.selectionStart = el.selectionEnd = start + 2;
  }
  @HostListener('window:message', ['$event'])
  message(event: MessageEvent): void {
    if (
      event.source !== this.frame()?.nativeElement.contentWindow ||
      event.data?.type !== 'campus-practice-log' ||
      !Array.isArray(event.data.args)
    )
      return;
    const text = event.data.args
      .filter((item: unknown) => typeof item === 'string')
      .map((item: string) => item.slice(0, 1000))
      .join(' ');
    this.logs.update((items) => [...items.slice(-49), text]);
  }
}
