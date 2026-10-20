import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
export interface LearningResource {
  id: number;
  title: string;
  url: string;
  type: string;
}
export type MaterialKind = 'pdf' | 'audio' | 'video' | 'image' | 'interactive' | 'link';
export function materialKind(resource: LearningResource): MaterialKind {
  const types: Record<string, MaterialKind> = {
    PDF: 'pdf',
    AUDIO: 'audio',
    VIDEO: 'video',
    IMAGE: 'image',
    INTERACTIVE: 'interactive',
  };
  if (types[resource.type]) return types[resource.type];
  const path = resource.url.split(/[?#]/)[0].toLowerCase();
  if (path.endsWith('.pdf')) return 'pdf';
  if (/\.(mp3|m4a|wav|aac|flac|ogg)$/.test(path)) return 'audio';
  if (/\.(mp4|webm|mov|ogv)$/.test(path)) return 'video';
  if (/\.(png|jpe?g|gif|webp|avif)$/.test(path)) return 'image';
  return 'link';
}
export function allowedMaterialUrl(value: string): boolean {
  return (
    /^https?:\/\/[^\s]+$/i.test(value) || /^\/api\/uploads\/[a-f0-9]{32}\.[a-z0-9]+$/i.test(value)
  );
}
@Component({
  selector: 'app-lesson-resource',
  template: `
    <section class="material">
      <header>
        <span>{{ labels[kind()] }}</span>
        <h3>{{ resource().title }}</h3>
      </header>
      @if (allowed()) {
        @switch (kind()) {
          @case ('pdf') {
            <iframe
              class="document"
              [src]="frameUrl()"
              [title]="resource().title"
              sandbox="allow-same-origin"
              referrerpolicy="no-referrer"
            ></iframe>
            <p>Si el documento no aparece, puedes abrirlo en otra pestaña.</p>
          }
          @case ('audio') {
            <div class="audio-cover">
              <span aria-hidden="true">♫</span><strong>Escucha a tu ritmo</strong
              ><audio
                controls
                preload="metadata"
                [src]="resource().url"
                (error)="failed.set(true)"
              ></audio>
            </div>
          }
          @case ('video') {
            <video
              controls
              playsinline
              preload="metadata"
              [src]="resource().url"
              (error)="failed.set(true)"
            ></video>
          }
          @case ('image') {
            <img
              [src]="resource().url"
              [alt]="resource().title"
              loading="lazy"
              (error)="failed.set(true)"
            />
          }
          @case ('interactive') {
            <iframe
              class="activity"
              [src]="frameUrl()"
              [title]="resource().title"
              sandbox="allow-scripts allow-forms"
              referrerpolicy="no-referrer"
            ></iframe>
            <p>
              Interactúa con el material del docente. Algunos sitios solo permiten abrirlo en otra
              pestaña.
            </p>
          }
          @default {
            <p>Abre el material de apoyo del docente en una pestaña nueva.</p>
          }
        }
        @if (failed()) {
          <p role="alert">No pudimos reproducir este archivo. Prueba con el enlace original.</p>
        }
        <a [href]="resource().url" target="_blank" rel="noopener noreferrer"
          >Abrir material original <span aria-hidden="true">↗</span></a
        >
      } @else {
        <p role="alert">Este material no tiene un enlace compatible.</p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .material {
      background: var(--surface, #fff);
      color: var(--ink, #10264c);
      padding: 22px;
    }
    header {
      margin-bottom: 18px;
    }
    header > span {
      font-size: 0.6rem;
      letter-spacing: 0.12em;
      color: #2476d9;
      font-weight: 700;
      text-transform: uppercase;
    }
    h3 {
      margin: 7px 0 0;
      font-size: 1.05rem;
    }
    p {
      font-size: 0.76rem;
      color: var(--muted, #647a9d);
      line-height: 1.7;
    }
    iframe {
      display: block;
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--border, #e1eaf6);
      border-radius: 12px;
      background: #fff;
    }
    .document {
      height: 560px;
    }
    .activity {
      height: 470px;
    }
    video {
      display: block;
      width: 100%;
      max-height: 500px;
      background: #0c1d34;
      border-radius: 12px;
    }
    img {
      display: block;
      max-width: 100%;
      max-height: 540px;
      margin: auto;
      object-fit: contain;
    }
    .audio-cover {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      padding: 34px 18px;
      background: linear-gradient(135deg, #1265ed12, #09b8c618);
      border-radius: 16px;
    }
    .audio-cover > span {
      display: grid;
      place-items: center;
      width: 66px;
      height: 66px;
      border-radius: 22px;
      background: #1265ed;
      color: white;
      font-size: 2.3rem;
    }
    .audio-cover strong {
      font-size: 1rem;
    }
    audio {
      width: 100%;
      max-width: 500px;
    }
    a {
      display: inline-flex;
      gap: 12px;
      align-items: center;
      margin-top: 16px;
      font-size: 0.76rem;
      color: #1265ed;
      text-decoration: none;
      font-weight: 600;
    }
    a:focus-visible {
      outline: 3px solid #2279ff;
      outline-offset: 3px;
    }
    @media (max-width: 600px) {
      .material {
        padding: 16px;
      }
      .document,
      .activity {
        height: 400px;
      }
    }
  `,
})
export class LessonResource {
  constructor() {
    effect(() => {
      this.resource();
      this.failed.set(false);
    });
  }
  readonly resource = input.required<LearningResource>();
  private readonly sanitizer = inject(DomSanitizer);
  readonly kind = computed(() => materialKind(this.resource()));
  readonly allowed = computed(() => allowedMaterialUrl(this.resource().url));
  readonly frameUrl = computed(() =>
    this.allowed() ? this.sanitizer.bypassSecurityTrustResourceUrl(this.resource().url) : null,
  );
  readonly failed = signal(false);
  readonly labels: Record<MaterialKind, string> = {
    pdf: 'Documento PDF',
    audio: 'Audio de la lección',
    video: 'Video',
    image: 'Imagen de apoyo',
    interactive: 'Actividad interactiva',
    link: 'Material de apoyo',
  };
}
